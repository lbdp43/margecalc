import { Router, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { authenticate } from '../middleware/auth';
import { analyzeBottleImage, analyzeInvoiceImage, OcrError } from '../services/scan.service';
import { prisma } from '../config/database';
import { sendKnownError } from '../utils/validation';

/**
 * Free OCR scan (Tesseract.js on this server — no API key, no external AI service).
 *
 * POST /api/scan/bottle   (alias /api/scan/product)  { imageBase64 } → BottleScanResult
 * POST /api/scan/invoice                             { imageBase64 } → InvoiceScanResult
 *
 * A failed read answers 422 { error: 'Lecture impossible : …', code, retryable } and is NOT
 * counted in the daily quota: only successful scans are recorded.
 */
const router = Router();

const scanSchema = z.object({
  imageBase64: z.string({ required_error: 'Aucune image reçue.' })
    .min(200, 'Lecture impossible : l’image reçue est vide.')
    .max(8_000_000, 'Photo trop volumineuse'),
});

// Per-minute burst protection, per user. Failed scans (4xx/5xx) do not count.
const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  skipFailedRequests: true,
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

/** Record one successful scan (never blocks the response on failure). */
function countSuccess(userId: string): void {
  prisma.scanUsage.create({ data: { userId } }).catch((err) => {
    console.warn('[SCAN] could not record usage:', err?.message ?? err);
  });
}

function sendScanError(res: Response, err: any, kind: 'bottle' | 'invoice'): void {
  if (err instanceof OcrError) {
    res.status(422).json({ error: err.message, code: err.code, retryable: err.retryable });
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
  try {
    const { imageBase64 } = scanSchema.parse(req.body);
    if (!(await checkDailyLimit(req, res))) return;
    const result = await analyzeBottleImage(imageBase64);
    countSuccess(req.user!.userId);
    res.json(result);
  } catch (err) {
    sendScanError(res, err, 'bottle');
  }
}

router.post('/bottle', scanBottle);
router.post('/product', scanBottle);

router.post('/invoice', async (req: Request, res: Response) => {
  try {
    const { imageBase64 } = scanSchema.parse(req.body);
    if (!(await checkDailyLimit(req, res))) return;
    const result = await analyzeInvoiceImage(imageBase64);
    countSuccess(req.user!.userId);
    res.json(result);
  } catch (err) {
    sendScanError(res, err, 'invoice');
  }
});

export default router;
