import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { authenticate } from '../middleware/auth';
import { analyzeBottleImage, analyzeInvoiceImage, OcrError, ScanAbortedError } from '../services/scan.service';
import { prisma } from '../config/database';
import { isZodError, sendKnownError } from '../utils/validation';

/**
 * Free OCR scan (Tesseract.js on this server — no API key, no external AI service).
 *
 * POST /api/scan/bottle   (alias /api/scan/product)  { imageBase64 } → BottleScanResult
 * POST /api/scan/invoice                             { imageBase64 } → InvoiceScanResult
 *
 * A failed read answers 422 { error: 'Lecture impossible : …', code, retryable } and is NOT
 * counted in the daily quota: only successful scans are recorded.
 *
 * Fair use of the single shared OCR worker: every scan request (failed or not) counts toward
 * the 10/min burst limit, one user can only have ONE scan in flight at a time (429 busy), and
 * after 3 timed-out (unreadable) photos in 10 minutes the user waits (429 cooldown).
 * A missing/empty image is a 422 bad_image like any unreadable photo.
 */
const router = Router();

const PHOTO_TOO_BIG = 'Photo trop volumineuse';

const scanSchema = z.object({
  imageBase64: z.string({ required_error: 'Lecture impossible : aucune image reçue. Reprenez la photo.', invalid_type_error: 'Lecture impossible : aucune image reçue. Reprenez la photo.' })
    .min(200, 'Lecture impossible : l’image reçue est vide.')
    .max(8_000_000, PHOTO_TOO_BIG),
});

// Per-minute burst protection, per user. EVERY request counts, failed ones included: a failed
// read still occupies the shared OCR worker (the daily quota, below, counts successes only).
const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => (req.user?.userId ? `user:${req.user.userId}` : `ip:${ipKeyGenerator(req.ip || '0.0.0.0')}`),
  message: { error: 'Trop de scans d’affilée, réessayez dans 1 minute.' },
});

// Daily successful-scan quota per user — persisted in DB (OCR is free but uses server CPU).
const DAILY_LIMIT = (() => {
  const v = parseInt(process.env.SCAN_DAILY_LIMIT || '', 10);
  return Number.isFinite(v) && v > 0 ? v : 50;
})();

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/** Answers 429 and returns false when today's quota of SUCCESSFUL scans is used up. Writes nothing. */
async function checkDailyLimit(req: Request, res: Response): Promise<boolean> {
  const today = startOfToday();
  const count = await prisma.scanUsage.count({
    where: { userId: req.user!.userId, scannedAt: { gte: today } },
  });
  if (count >= DAILY_LIMIT) {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const hoursLeft = Math.max(1, Math.ceil((tomorrow.getTime() - Date.now()) / 3_600_000));
    res.status(429).json({
      error: `Limite de ${DAILY_LIMIT} scans par jour atteinte. Réessayez dans ${hoursLeft} h ou remplissez la fiche à la main.`,
      code: 'quota',
    });
    return false;
  }
  return true;
}

/** Users with a scan in progress: one at a time each, so nobody can monopolise the OCR queue. */
const inFlight = new Set<string>();

/** Runs `job` as the user's only in-flight scan; a second concurrent scan gets 429 busy. */
async function oneScanAtATime(req: Request, res: Response, job: () => Promise<void>): Promise<void> {
  const uid = req.user!.userId;
  if (inFlight.has(uid)) {
    res.status(429).json({
      error: 'Un scan est déjà en cours. Attendez son résultat avant d’en lancer un autre.',
      code: 'busy',
      retryable: true,
    });
    return;
  }
  inFlight.add(uid);
  try {
    await job();
  } finally {
    inFlight.delete(uid);
  }
}

/**
 * Aborted when the client goes away before the answer (back button during the OCR, closed tab,
 * network drop): the queued OCR job is skipped, a running one stops after its current pass, and
 * the scan is neither answered nor counted in the daily quota.
 * `res` 'close' (not `req` 'close', which fires once the body is read) without a finished
 * response means the connection was lost.
 */
function clientGoneSignal(res: Response): AbortSignal {
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) ac.abort();
  });
  return ac.signal;
}

/** Record one successful scan (never blocks the response on failure). */
function countSuccess(userId: string): void {
  prisma.scanUsage.create({ data: { userId } }).catch((err) => {
    console.warn('[SCAN] could not record usage:', err?.message ?? err);
  });
}

// --- Unreadable photos in a row ----------------------------------------------------------------
// A noisy / textless photo holds the single shared OCR worker for its whole time budget, then the
// worker is restarted. One user re-sending such photos back to back could keep it busy for
// everyone: after TIMEOUT_STRIKES timeouts within TIMEOUT_WINDOW_MS, that user waits a bit.
const TIMEOUT_STRIKES = 3;
const TIMEOUT_WINDOW_MS = 10 * 60 * 1000;
const timeoutStrikes = new Map<string, number[]>();

function recentTimeouts(uid: string): number[] {
  const cutoff = Date.now() - TIMEOUT_WINDOW_MS;
  const list = (timeoutStrikes.get(uid) || []).filter((t) => t > cutoff);
  if (list.length) timeoutStrikes.set(uid, list);
  else timeoutStrikes.delete(uid);
  return list;
}

function recordTimeout(uid: string): void {
  timeoutStrikes.set(uid, [...recentTimeouts(uid), Date.now()]);
}

setInterval(() => {
  for (const uid of [...timeoutStrikes.keys()]) recentTimeouts(uid);
}, TIMEOUT_WINDOW_MS).unref();

/** Answers 429 and returns false while the user is cooling down after unreadable photos. */
function checkTimeoutCooldown(req: Request, res: Response): boolean {
  const list = recentTimeouts(req.user!.userId);
  if (list.length < TIMEOUT_STRIKES) return true;
  const retryInMs = list[0] + TIMEOUT_WINDOW_MS - Date.now();
  const minutes = Math.max(1, Math.ceil(retryInMs / 60_000));
  res.setHeader('Retry-After', String(Math.ceil(retryInMs / 1000)));
  res.status(429).json({
    error: `Trop de photos illisibles d’affilée, réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''} — ou remplissez la fiche à la main.`,
    code: 'cooldown',
    retryable: true,
  });
  return false;
}

function sendScanError(req: Request, res: Response, err: any, kind: 'bottle' | 'invoice'): void {
  if (err instanceof ScanAbortedError) {
    console.log(`[SCAN] ${kind} scan cancelled: the client left before the result (not counted)`);
    return; // nobody to answer
  }
  if (err instanceof OcrError) {
    if (err.code === 'timeout') recordTimeout(req.user!.userId);
    res.status(422).json({ error: err.message, code: err.code, retryable: err.retryable });
    return;
  }
  // Same contract as the body-size limit: an oversized image is a 413, not a validation 400.
  if (isZodError(err) && err.issues.some((i) => i.message === PHOTO_TOO_BIG)) {
    res.status(413).json({ error: PHOTO_TOO_BIG });
    return;
  }
  // Missing / empty image: a failed read like any other (422 bad_image), not a validation 400.
  if (isZodError(err) && err.issues.length && err.issues.every((i) => i.path[0] === 'imageBase64' || i.path.length === 0)) {
    const msg = err.issues[0].message;
    res.status(422).json({
      error: msg.startsWith('Lecture impossible') ? msg : 'Lecture impossible : aucune image reçue. Reprenez la photo.',
      code: 'bad_image',
      retryable: false,
    });
    return;
  }
  if (sendKnownError(res, err)) return;
  console.error(`[SCAN] ${kind} scan error:`, err?.message ?? err);
  res.status(422).json({
    error: kind === 'bottle'
      ? 'Lecture impossible : une erreur est survenue pendant l’analyse. Remplissez la fiche à la main ou réessayez.'
      : 'Lecture impossible : une erreur est survenue pendant l’analyse de la facture. Réessayez avec une autre photo.',
    code: 'engine',
    retryable: true,
  });
}

router.use(authenticate);

// GET /api/scan/quota — { limit, used, remaining } for today (successful scans only)
router.get('/quota', async (req: Request, res: Response) => {
  try {
    const used = await prisma.scanUsage.count({
      where: { userId: req.user!.userId, scannedAt: { gte: startOfToday() } },
    });
    res.json({ limit: DAILY_LIMIT, used, remaining: Math.max(0, DAILY_LIMIT - used) });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.use(scanLimiter);

async function scanBottle(req: Request, res: Response) {
  const signal = clientGoneSignal(res);
  await oneScanAtATime(req, res, async () => {
    try {
      const { imageBase64 } = scanSchema.parse(req.body);
      if (!checkTimeoutCooldown(req, res)) return;
      if (!(await checkDailyLimit(req, res))) return;
      const result = await analyzeBottleImage(imageBase64, signal);
      // Only a result the client actually receives counts toward the quota.
      if (signal.aborted) throw new ScanAbortedError();
      countSuccess(req.user!.userId);
      res.json(result);
    } catch (err) {
      sendScanError(req, res, err, 'bottle');
    }
  });
}

router.post('/bottle', scanBottle);
router.post('/product', scanBottle);

router.post('/invoice', async (req: Request, res: Response) => {
  const signal = clientGoneSignal(res);
  await oneScanAtATime(req, res, async () => {
    try {
      const { imageBase64 } = scanSchema.parse(req.body);
      if (!checkTimeoutCooldown(req, res)) return;
      if (!(await checkDailyLimit(req, res))) return;
      const result = await analyzeInvoiceImage(imageBase64, signal);
      if (signal.aborted) throw new ScanAbortedError();
      countSuccess(req.user!.userId);
      res.json(result);
    } catch (err) {
      sendScanError(req, res, err, 'invoice');
    }
  });
});

export default router;
