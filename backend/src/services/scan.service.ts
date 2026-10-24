/**
 * Free, server-side OCR for bottle labels and supplier invoices (Tesseract.js 5, no API key,
 * no external AI service).
 *
 * Exports analyzeBottleImage / analyzeInvoiceImage with the response shape the mobile client
 * expects (see BottleScanResult / InvoiceScanResult in @margebar/shared). Every failure is an
 * OcrError whose message starts with « Lecture impossible » (the route maps it to 422).
 *
 * Runtime design
 * - ONE long-lived Tesseract worker (fra+eng, LSTM only), created lazily on first scan and
 *   terminated after OCR_IDLE_MS of inactivity (frees ~150 MB RSS).
 * - Jobs are serialized through a small queue (the worker is single-threaded and
 *   setParameters/recognize must not interleave). Queue length is capped (OCR_MAX_QUEUE).
 * - Every job has a deadline. A recognize() that overruns is aborted by terminating the
 *   worker (Tesseract cannot cancel a job); the next scan recreates it (~0.5 s with local data).
 * - Language data: if the npm packages @tesseract.js-data/fra and @tesseract.js-data/eng are
 *   installed (recommended: add them to backend/package.json), the gzipped traineddata is
 *   copied once to TESSDATA_DIR and read locally (no network, nothing written to cwd).
 *   Otherwise (packages missing) it is downloaded once from cdn.jsdelivr.net and cached in TESSDATA_DIR.
 *
 * Extraction is heuristic (no AI): name = biggest text lines, category = weighted keywords
 * (+ ABV / volume fallback), volume (cl/ml/L), ABV (% vol / °), price (€),
 * invoice rows = designation + qty × unit price ≈ total consistency check.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createWorker, OEM, PSM } from 'tesseract.js';
import type { Worker, Page, Line } from 'tesseract.js';
import { CONTAINER_PRESETS } from '@margebar/shared';
import type { BottleScanResult, InvoiceScanProduct, InvoiceScanResult } from '@margebar/shared';

// ---------------------------------------------------------------------------
// Public API (shape shared with the mobile client)
// ---------------------------------------------------------------------------

export type ScanResult = BottleScanResult;
export type InvoiceProduct = InvoiceScanProduct;
export type { InvoiceScanResult };

const RAW_MAX_CHARS = 4000;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const envInt = (name: string, def: number) => {
  const v = parseInt(process.env[name] || '', 10);
  return Number.isFinite(v) && v > 0 ? v : def;
};

const OCR_LANGS = (process.env.OCR_LANGS || 'fra+eng').split('+').filter(Boolean);
const TESSDATA_DIR = process.env.TESSDATA_DIR || path.join(os.tmpdir(), 'margebar-tessdata');
const INIT_TIMEOUT_MS = envInt('OCR_INIT_TIMEOUT_MS', 30_000);
// A legible label reads in 0.3–4 s; noisy / textless photos are the ones that run long, so a
// short budget keeps the single shared worker available for everyone.
const BOTTLE_TIMEOUT_MS = envInt('OCR_BOTTLE_TIMEOUT_MS', 15_000);
const INVOICE_TIMEOUT_MS = envInt('OCR_INVOICE_TIMEOUT_MS', 60_000);
const IDLE_MS = envInt('OCR_IDLE_MS', 10 * 60_000);
const MAX_QUEUE = envInt('OCR_MAX_QUEUE', 6);
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
// Pixel size limits (long side). The app sends ~1600 px; a bigger photo only makes Tesseract
// slower (a noisy 4000 px photo holds the shared worker for the whole budget) without reading more.
const MAX_SIDE_BOTTLE = envInt('OCR_MAX_SIDE_BOTTLE', 2400);
const MAX_SIDE_INVOICE = envInt('OCR_MAX_SIDE_INVOICE', 3500);

export type OcrErrorCode = 'bad_image' | 'empty' | 'busy' | 'timeout' | 'engine';

/** OCR failure. `message` is a readable French sentence starting with « Lecture impossible ». */
export class OcrError extends Error {
  constructor(message: string, public readonly code: OcrErrorCode) {
    super(message);
    this.name = 'OcrError';
  }
  /** True when retrying the same photo later may work (server busy / engine restarting). */
  get retryable(): boolean {
    return this.code === 'busy' || this.code === 'engine' || this.code === 'timeout';
  }
}

/**
 * The client went away before the result (back button, closed tab): the scan stops at the next
 * checkpoint (before it starts, or between two OCR passes) and nothing is sent or counted.
 */
export class ScanAbortedError extends Error {
  constructor() {
    super('Scan annulé : le client a quitté avant le résultat.');
    this.name = 'ScanAbortedError';
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ScanAbortedError();
}

// ---------------------------------------------------------------------------
// Worker lifecycle: lazy singleton + serialized queue + deadlines + idle shutdown
// ---------------------------------------------------------------------------

let workerPromise: Promise<Worker> | null = null;
let tail: Promise<unknown> = Promise.resolve();
let pending = 0;
let idleTimer: NodeJS.Timeout | null = null;

function languageOptions(): Record<string, unknown> {
  fs.mkdirSync(TESSDATA_DIR, { recursive: true });
  try {
    for (const lang of OCR_LANGS) {
      const dst = path.join(TESSDATA_DIR, `${lang}.traineddata.gz`);
      if (!fs.existsSync(dst)) {
        const src = require.resolve(`@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`);
        fs.copyFileSync(src, dst);
      }
    }
    // All languages available locally: read them from TESSDATA_DIR, never touch the network/cwd.
    return { langPath: TESSDATA_DIR, cacheMethod: 'none', gzip: true };
  } catch {
    // Packages not installed: download from jsdelivr once, cache (uncompressed) in TESSDATA_DIR.
    return { cachePath: TESSDATA_DIR, cacheMethod: 'write' };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  p.catch(() => {}); // the loser of the race must never become an unhandledRejection (would crash Node)
  const t = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new OcrError('Lecture impossible : l’analyse a pris trop de temps. Réessayez avec une photo plus nette et mieux cadrée, ou remplissez la fiche à la main.', 'timeout'));
    }, ms);
  });
  return Promise.race([p, t]).finally(() => clearTimeout(timer));
}

let initFailedAt = 0;
const INIT_RETRY_BACKOFF_MS = 60_000;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    if (Date.now() - initFailedAt < INIT_RETRY_BACKOFF_MS) {
      return Promise.reject(new OcrError('Lecture impossible : la lecture automatique est momentanément indisponible. Remplissez la fiche à la main.', 'engine'));
    }
    const started = Date.now();
    let ready = false;
    let failInit: (e: unknown) => void = () => {};
    // tesseract.js 5 never settles createWorker() when the language data cannot be loaded
    // (e.g. CDN unreachable): it only reports it to errorHandler. Turn that into a rejection.
    const initFailed = new Promise<never>((_, reject) => { failInit = reject; });
    initFailed.catch(() => {});
    const p = createWorker(OCR_LANGS.join('+'), OEM.LSTM_ONLY, {
      ...languageOptions(),
      // Mandatory: without an errorHandler tesseract.js re-throws job errors inside its
      // message handler (uncaught exception -> the whole API process crashes).
      errorHandler: (err: unknown) => {
        console.error('[OCR] worker error:', err);
        if (!ready) failInit(new OcrError('Lecture impossible : le moteur de lecture n’a pas pu démarrer. Remplissez la fiche à la main.', 'engine'));
      },
    }).then((w) => {
      ready = true;
      console.log(`[OCR] worker ready in ${Date.now() - started} ms (${OCR_LANGS.join('+')})`);
      return w;
    });
    const wp = withTimeout(Promise.race([p, initFailed]), INIT_TIMEOUT_MS, () => {
      p.then((w) => w.terminate()).catch(() => {});
    });
    wp.catch(() => {
      initFailedAt = Date.now();
      if (workerPromise === wp) workerPromise = null;
    });
    workerPromise = wp;
  }
  return workerPromise;
}

async function resetWorker(): Promise<void> {
  const p = workerPromise;
  workerPromise = null;
  if (!p) return;
  try {
    const w = await p;
    await w.terminate();
  } catch { /* already dead */ }
}

function scheduleIdleShutdown() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (pending === 0 && workerPromise) {
      console.log('[OCR] idle: terminating worker');
      void resetWorker();
    }
  }, IDLE_MS);
  idleTimer.unref();
}

/**
 * Run `job` alone on the worker. Rejects fast when the queue is full or the deadline passed.
 * With `signal`: a job whose client left while it was queued is skipped (never started), and the
 * returned promise rejects with ScanAbortedError as soon as the client leaves.
 */
function runExclusive<T>(job: (w: Worker, remainingMs: number) => Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(new ScanAbortedError());
  if (pending >= MAX_QUEUE) {
    return Promise.reject(new OcrError('Lecture impossible pour le moment : le serveur lit déjà plusieurs images. Réessayez dans quelques secondes.', 'busy'));
  }
  pending++;
  const deadline = Date.now() + timeoutMs;
  const run = tail.then(async () => {
    throwIfAborted(signal); // client gone while queued: give the worker to the next scan
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new OcrError('Lecture impossible pour le moment : le serveur est occupé. Réessayez dans un instant.', 'busy');
    const worker = await getWorker();
    return withTimeout(job(worker, remaining), Math.max(1, deadline - Date.now()), () => {
      // A stuck recognize() cannot be cancelled: kill the worker, the next job recreates it.
      void resetWorker();
    });
  });
  tail = run.catch(() => undefined);
  const done = run.finally(() => {
    pending--;
    scheduleIdleShutdown();
  });
  if (!signal) return done;
  // Answer the caller as soon as the client leaves (the queued job is skipped when its turn
  // comes, a running one stops after its current pass).
  done.catch(() => {});
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new ScanAbortedError());
    signal.addEventListener('abort', onAbort, { once: true });
    done.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

interface OcrPage {
  text: string;
  confidence: number;
  lines: OcrLine[];
  ms: number;
}

interface OcrLine {
  text: string;
  conf: number;
  height: number;
  x0: number; y0: number; x1: number; y1: number;
}

/**
 * One OCR pass = a binarization method + a rotation. Photos taken in a bar are often dark
 * (Otsu fails, Sauvola works) or tilted by more than ~5° (Tesseract's own deskew gives up).
 */
interface PassSpec {
  label: string;
  /** Tesseract 5 thresholding_method: 0 = Otsu, 1 = Leptonica adaptive, 2 = Sauvola */
  threshold: '0' | '1' | '2';
  /**
   * 'auto' = Tesseract deskew (small angles only); a number = force this rotation (degrees);
   * 'follow' = 1.8 x the forced rotation that helped most so far (skipped if none helped).
   */
  rotate: 'auto' | number | 'follow';
}

const BOTTLE_PASSES: PassSpec[] = [
  { label: 'otsu', threshold: '0', rotate: 'auto' },
  { label: 'sauvola', threshold: '2', rotate: 'auto' },
  { label: 'rot+9', threshold: '0', rotate: 9 },
  { label: 'rot-9', threshold: '0', rotate: -9 },
  { label: 'rot-follow', threshold: '0', rotate: 'follow' },
  { label: 'adaptive', threshold: '1', rotate: 'auto' },
];
const INVOICE_PASSES: PassSpec[] = [
  { label: 'otsu', threshold: '0', rotate: 'auto' },
  { label: 'sauvola', threshold: '2', rotate: 'auto' },
  { label: 'rot+8', threshold: '0', rotate: 8 },
  { label: 'rot-8', threshold: '0', rotate: -8 },
  { label: 'rot-follow', threshold: '0', rotate: 'follow' },
];

interface PassResult<T> { pass: string; value: T; quality: number; ms: number }

/**
 * Run OCR passes in order on the shared worker until `evaluate` says the result is good
 * enough (quality >= goodEnough) or the pass budget is spent. Returns every pass result.
 */
function ocrPasses<T>(
  image: Buffer,
  psm: PSM,
  timeoutMs: number,
  passes: PassSpec[],
  evaluate: (page: OcrPage) => { value: T; quality: number },
  goodEnough: number,
  signal?: AbortSignal,
): Promise<PassResult<T>[]> {
  return runExclusive(async (worker) => {
    const started = Date.now();
    const results: PassResult<T>[] = [];
    let baseQuality = 0;
    let bestRot: { deg: number; quality: number } | null = null;
    let blankPasses = 0;
    for (const pass of passes) {
      // Client gone (back button): stop here, the worker goes to the next user's scan.
      throwIfAborted(signal);
      // Keep headroom: never start a new pass after 60% of the budget.
      if (results.length && Date.now() - started > timeoutMs * 0.6) break;
      // Two binarizations (Otsu + Sauvola) read no usable text at all: rotations will not
      // help either — give the worker back instead of burning the whole budget on junk.
      if (blankPasses >= 2) break;
      let rotate: number | 'auto';
      if (pass.rotate === 'follow') {
        if (!bestRot || bestRot.quality <= baseQuality) continue;
        rotate = Math.round(bestRot.deg * 1.8);
      } else {
        rotate = pass.rotate;
      }
      const t0 = Date.now();
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: psm,
          preserve_interword_spaces: '1',
          user_defined_dpi: '300',
          thresholding_method: pass.threshold,
        });
        const opts = rotate === 'auto' ? { rotateAuto: true } : { rotateRadians: (rotate * Math.PI) / 180 };
        const { data } = await worker.recognize(image, opts, { text: true, blocks: true, hocr: false, tsv: false });
        const page = toOcrPage(data, Date.now() - t0);
        if (!hasUsableText(page)) blankPasses++;
        const { value, quality } = evaluate(page);
        const label = pass.rotate === 'follow' && typeof rotate === 'number' ? `rot${rotate > 0 ? '+' : ''}${rotate}` : pass.label;
        results.push({ pass: label, value, quality, ms: page.ms });
        if (rotate === 'auto') baseQuality = Math.max(baseQuality, quality);
        else if (!bestRot || quality > bestRot.quality) bestRot = { deg: rotate, quality };
        if (quality >= goodEnough) break;
      } catch (err) {
        if (err instanceof ScanAbortedError) throw err;
        console.error('[OCR] recognize failed:', err);
        void resetWorker(); // start from a clean wasm heap next time
        if (results.length) break;
        throw new OcrError('Lecture impossible : cette image n’a pas pu être analysée. Essayez une autre photo (JPEG ou PNG, bien éclairée).', 'bad_image');
      }
    }
    return results;
  }, timeoutMs, signal);
}

/** At least one confidently-read line holding a real word (3+ letters) or a number with a unit. */
function hasUsableText(page: OcrPage): boolean {
  return page.lines.some((l) => l.conf >= 45
    && (/[A-Za-zÀ-ÿ]{3,}/.test(l.text) || /\d\s?(?:cl|ml|l|%|°|€)/i.test(l.text)));
}

function toOcrPage(data: Page, ms: number): OcrPage {
  const lines: OcrLine[] = (data.lines || [])
    .map((l: Line) => ({
      text: (l.text || '').replace(/\s+$/g, ''),
      conf: l.confidence,
      height: l.rowAttributes?.row_height || (l.bbox.y1 - l.bbox.y0),
      x0: l.bbox.x0, y0: l.bbox.y0, x1: l.bbox.x1, y1: l.bbox.y1,
    }))
    .filter((l) => l.text.trim().length > 0);
  return { text: data.text || '', confidence: data.confidence || 0, lines, ms };
}

/** Pre-load the worker (optional, e.g. a few seconds after boot). */
export async function warmupOcr(): Promise<void> {
  await getWorker();
  scheduleIdleShutdown();
}

/** Terminate the worker (graceful shutdown / tests). */
export async function shutdownOcr(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer);
  await resetWorker();
}

// ---------------------------------------------------------------------------
// Image decoding / validation
// ---------------------------------------------------------------------------

/**
 * Width × height read from the image header (JPEG SOFn, PNG IHDR, WebP VP8/VP8L/VP8X, BMP),
 * without decoding the image. Null when the header cannot be read.
 */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  try {
    if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.toString('ascii', 12, 16) === 'IHDR') {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker === 0xff) { i++; continue; } // fill byte
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        const len = buf.readUInt16BE(i + 2);
        const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSof) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        if (len < 2) return null;
        i += 2 + len;
      }
      return null;
    }
    if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      const chunk = buf.toString('ascii', 12, 16);
      if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (chunk === 'VP8L') {
        const b = buf.readUInt32LE(21);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
      if (chunk === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
      return null;
    }
    if (buf.length >= 26 && buf[0] === 0x42 && buf[1] === 0x4d) {
      return { width: Math.abs(buf.readInt32LE(18)), height: Math.abs(buf.readInt32LE(22)) };
    }
  } catch { /* truncated header */ }
  return null;
}

function decodeImage(imageBase64: string, maxSide: number): Buffer {
  const b64 = imageBase64.replace(/^data:[^;,]+;base64,/, '').replace(/\s+/g, '');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 64) throw new OcrError('Lecture impossible : l’image est vide ou illisible.', 'bad_image');
  if (buf.length > MAX_IMAGE_BYTES) throw new OcrError('Lecture impossible : l’image est trop volumineuse (12 Mo maximum).', 'bad_image');
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf.readUInt32BE(0) === 0x89504e47;
  const isWebp = buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  const isBmp = buf[0] === 0x42 && buf[1] === 0x4d;
  if (!isJpeg && !isPng && !isWebp && !isBmp) {
    throw new OcrError('Lecture impossible : format d’image non supporté (utilisez JPEG, PNG ou WebP).', 'bad_image');
  }
  const size = imageSize(buf);
  if (size && Math.max(size.width, size.height) > maxSide) {
    const fmt = (n: number) => n.toLocaleString('fr-FR').replace(/\s/g, '\u202f');
    throw new OcrError(
      `Lecture impossible : la photo est trop grande (${fmt(size.width)} × ${fmt(size.height)} px, ${fmt(maxSide)} px maximum). Reprenez-la depuis l’application, qui la réduit automatiquement.`,
      'bad_image',
    );
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/** lowercase, no accents, normalized apostrophes/spaces — for keyword matching only. */
export function norm(s: string): string {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[’`´]/g, '\'')
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fix the usual OCR digit confusions inside numbers ("7O cl" -> "70 cl", "70c1" -> "70cl"). */
export function fixDigits(s: string): string {
  return s
    .replace(/(\d)[oO](?=\d|\s?(?:c[l1|]|ml|%|°))/g, '$10')
    .replace(/(?<=\d)[oO](?=\d)/g, '0')
    .replace(/(?<=\d)[lI|](?=\d)/g, '1')
    .replace(/(\d)\s?[cC][¢©]?[lL1|I](?![\w])/g, '$1 cl');
}

const SMALL_WORDS = new Set(['de', 'des', 'du', 'd', 'et', 'aux', 'au', 'a', 'à', 'en', 'sur', 'sous', 'la', 'le', 'of', 'the', 'and']);

/** "HERBE DES DRUIDES" -> "Herbe des Druides"; mixed-case text is kept as printed. */
export function smartCase(s: string): string {
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (!letters) return s;
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, '').length / letters.length;
  if (upper < 0.8) return s;
  return s.toLowerCase().split(/(\s+|-|')/).map((w, i) => {
    if (!w.trim() || w === '-' || w === '\'') return w;
    if (i > 0 && SMALL_WORDS.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join('');
}

function cleanText(s: string): string {
  return s
    .replace(/[|[\]{}_~«»"“”•·*=<>]+/g, ' ')
    .replace(/^[\s\-—–.,:;'`]+|[\s\-—–,:;'`]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const parseNum = (s: string) => parseFloat(s.replace(/[\s\u202f.](?=\d{3}(?:\D|$))/g, '').replace(',', '.'));

// ---------------------------------------------------------------------------
// Field extractors (exported for tests)
// ---------------------------------------------------------------------------

const PRESET_VOLUMES = CONTAINER_PRESETS.map((p) => p.volumeCl);
const VOLUME_RE = /(?:^|[^\w.,])(\d{1,4}(?:[.,]\d{1,3})?)\s?(cl|ml|l|ltr|litres?|liters?)(?![a-zà-ÿ0-9])/gi;

/** Container volume in cl ("70cl", "0,7 L", "700 ml", "1L", "Fût 30L"), snapped to presets. */
export function extractVolumeCl(text: string): number | null {
  const t = fixDigits(text);
  const cands: { cl: number; score: number }[] = [];
  for (const line of t.split('\n')) {
    VOLUME_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = VOLUME_RE.exec(line))) {
      const v = parseFloat(m[1].replace(',', '.'));
      const unit = m[2].toLowerCase();
      let cl = unit === 'cl' ? v : unit === 'ml' ? v / 10 : v * 100;
      if (!(cl >= 1 && cl <= 6000)) continue;
      const preset = PRESET_VOLUMES.find((p) => Math.abs(p - cl) / p <= 0.02);
      if (preset) cl = preset;
      let score = preset ? 2 : 0;
      if (/%\s?vol|°/i.test(line)) score += 1;
      if (unit === 'l' && v >= 10 && v % 1 === 0 && !/f[uû]t|keg|bib|cubi/i.test(line)) score -= 1; // "12 L" noise
      cands.push({ cl: round2(cl), score });
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score);
  return cands[0].cl;
}

const ABV_RE = /(?:alc\.?\s*|abv\s*)?(?<![\d.,])(\d{1,2}(?:[.,]\d{1,2})?)\s?(%|°)\s?(vol\.?|alc\.?|abv)?/gi;

/** Alcohol by volume ("40% vol", "12,5°", "alc. 5.5%"), ignoring VAT/discount percentages. */
export function extractAbv(text: string): number | null {
  return extractAbvScored(text, 0);
}

/** Same, but only an ABV printed with its context ("% vol", "alc.", "abv", "°"). */
export function extractAbvStrict(text: string): number | null {
  return extractAbvScored(text, 1);
}

function extractAbvScored(text: string, minScore: number): number | null {
  const t = fixDigits(text);
  let best: { v: number; score: number } | null = null;
  for (const line of t.split('\n')) {
    ABV_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ABV_RE.exec(line))) {
      const v = parseFloat(m[1].replace(',', '.'));
      if (!(v >= 0.5 && v <= 80)) continue;
      const before = norm(line.slice(Math.max(0, m.index - 14), m.index));
      if (/(tva|t\.v\.a|remise|taux|promo|escompte|reduction|-)\s*$/.test(before)) continue;
      let score = 0;
      if (m[3]) score += 2;
      if (/alc|abv/i.test(m[0])) score += 2;
      if (m[2] === '°') score += 1;
      if (score < minScore) continue;
      if (!best || score > best.score) best = { v, score };
    }
  }
  return best ? best.v : null;
}

/** First price in euros ("12,90 €", "€15.99", "Prix HT : 8,90"). */
export function extractPrice(text: string): number | null {
  const t = fixDigits(text);
  const patterns = [
    /(?<![\d.,])(\d{1,4}(?:[.,]\d{2}))\s?(?:€|eur\b|euros?\b)/i,
    /€\s?(\d{1,4}(?:[.,]\d{2}))/,
    /prix(?:\s+ht)?\s*:?\s*(\d{1,4}[.,]\d{2})/i,
  ];
  for (const p of patterns) {
    const m = t.match(p);
    if (m) return parseNum(m[1]);
  }
  return null;
}

// Category keywords (matched on norm()'d text with word boundaries). Weight 3 = unambiguous.
type Slug = 'spiritueux' | 'vins' | 'bieres' | 'softs' | 'ingredients_cocktails' | 'consommables';
const KW: Record<Slug, [RegExp, number][]> = {
  spiritueux: [
    [/\b(whisk(e)?y|bourbon|scotch|vodka|gin|rhum|rum|ron|cognac|armagnac|calvados|tequila|mezcal|brandy|pisco|cachaca|grappa|absinthe|pastis|ricard|pernod|eau[- ]de[- ]vie|genepi|aquavit|single malt|blended)\b/, 3],
    [/\b(liqueur|spiritueux|spirit|distill(ed|erie|ery)|triple distilled|aged \d+|\d+ ans|xo|vsop|v\.s\.o\.p|london dry)\b/, 1],
    [/\b(jameson|jack daniel'?s|johnnie walker|ballantine'?s|chivas|glenfiddich|absolut|smirnoff|grey goose|bacardi|havana club|captain morgan|diplomatico|bombay|tanqueray|hendrick'?s|beefeater|jagermeister|get 27|clan campbell|label 5|four roses|aberlour|nikka)\b/, 3],
  ],
  vins: [
    [/\b(vin|vins|wine|chateau|domaine|appellation|aoc|aop|igp|cru|cuvee|millesime|mis en bouteille|grand vin|vignoble|vigneron)s?\b/, 2],
    [/\b(bordeaux|bourgogne|beaujolais|champagne|cremant|prosecco|cava|chablis|sancerre|muscadet|corbieres|languedoc|minervois|cotes du rhone|cotes de provence|provence|rioja|chianti|medoc|saint[- ]emilion|pomerol|alsace|loire|vouvray|chinon|gaillac|cahors|madiran|jurancon|bandol|tavel|gigondas|vacqueyras|chateauneuf)\b/, 2],
    [/\b(merlot|cabernet|pinot|chardonnay|sauvignon|syrah|grenache|gamay|malbec|riesling|gewurztraminer|viognier|chenin|carignan|mourvedre|cinsault|muscat|semillon|tempranillo)\b/, 2],
    [/\b(rouge|blanc|rose|brut|demi[- ]sec|moelleux|cidre|poire|porto|sherry|xeres|vermouth rouge)\b/, 1],
  ],
  bieres: [
    [/\b(biere|bieres|beer|brasserie|brewery|brewing|brouwerij|ipa|neipa|lager|pils|pilsner|stout|porter|ale|saison|tripel|weiss|weizen|witbier|gueuze|lambic|kriek)\b/, 3],
    [/\b(blonde|ambree|brune|blanche|houblon|hops?|malt|fut|keg|pression|bock)\b/, 1],
    [/\b(kronenbourg|1664|heineken|leffe|grimbergen|affligem|desperados|guinness|chouffe|pelforth|carlsberg|tourtel|corona|budweiser|stella artois|hoegaarden|chimay|duvel|karmeliet|delirium|goudale|jupiler|paulaner|meteor|fischer|edelweiss|brewdog|punk ipa)\b/, 3],
  ],
  softs: [
    [/\b(coca[- ]?cola|coca|cola|pepsi|orangina|schweppes|perrier|evian|vittel|badoit|san pellegrino|s\.pellegrino|volvic|contrex|red bull|monster|sprite|fanta|oasis|lipton|ice tea|fuze|tropicana|joker|pago|granini|capri[- ]sun|fever[- ]tree|ginger (ale|beer)|limonade|soda|tonic|jus|nectar|eau minerale|eau gazeuse|eau de source|sans alcool|soft)\b/, 3],
  ],
  ingredients_cocktails: [
    [/\b(sirop|syrup|monin|giffard|teisseire|routin|puree|grenadine|orgeat|sucre de canne|triple sec|curacao|blue curacao|angostura|bitters?|cointreau|grand marnier|amaretto|baileys|kahlua|malibu|limoncello|creme de|liqueur de|vermouth|martini|campari|aperol|lillet|cordial|lime juice|jus de citron vert|sour mix)\b/, 3],
  ],
  consommables: [
    [/\b(gobelets?|pailles?|serviettes?|sous[- ]bocks?|capsules?|glacons?|ecocup|touillettes?|cure[- ]dents?|nappes?|sacs?|emballages?|filtres?|co2|bouteille de gaz|detergent|liquide vaisselle|papier)\b/, 3],
  ],
};
const CATEGORY_PRIORITY: Slug[] = ['ingredients_cocktails', 'softs', 'spiritueux', 'bieres', 'vins', 'consommables'];

/** Weighted keyword scoring + ABV/volume fallback. Returns the slug and a 0..1 certainty. */
export function detectCategory(text: string, abv: number | null = null, volumeCl: number | null = null): { slug: Slug; certainty: number } {
  let t = norm(text);
  // Disambiguation before scoring
  t = t.replace(/\bginger (ale|beer)\b/g, ' ginger soda ');
  if (/\b(whisk(e)?y|scotch|bourbon)\b/.test(t)) t = t.replace(/\bmalt\b/g, ' ');
  const scores = Object.fromEntries(CATEGORY_PRIORITY.map((c) => [c, 0])) as Record<Slug, number>;
  for (const cat of CATEGORY_PRIORITY) {
    for (const [re, w] of KW[cat]) {
      const g = new RegExp(re.source, 'g');
      const n = (t.match(g) || []).length;
      scores[cat] += Math.min(n, 3) * w;
    }
  }
  // ABV coherence bonus
  if (abv !== null) {
    // No wine (port/VDN ≤ 22 %), beer or soft reaches 23 %: « Marc de Bourgogne 45 % » is a spirit.
    if (abv >= 23) { scores.vins = 0; scores.bieres = 0; scores.softs = 0; }
    if (abv >= 30) scores.spiritueux += 2;
    else if (abv >= 8.5 && abv <= 16) scores.vins += 1.5;
    else if (abv >= 0.5 && abv < 8.5) { scores.bieres += 1.5; scores.vins += 0.5; }
  } else if (/\b0[.,]0\s?%/.test(t) || /\bsans alcool\b/.test(t)) {
    scores.softs += 1;
  }
  let best: Slug = 'spiritueux';
  let bestScore = 0;
  for (const cat of CATEGORY_PRIORITY) {
    if (scores[cat] > bestScore) { best = cat; bestScore = scores[cat]; }
  }
  if (bestScore > 0) {
    const total = Object.values(scores).reduce((a, b) => a + b, 0);
    return { slug: best, certainty: Math.min(1, (bestScore / total) * Math.min(1, bestScore / 3)) };
  }
  // No keyword, no ABV: guess from the container
  if (volumeCl === 75 || volumeCl === 150) return { slug: 'vins', certainty: 0.3 };
  if (volumeCl === 70 || volumeCl === 100) return { slug: 'spiritueux', certainty: 0.25 };
  if (volumeCl === 2000 || volumeCl === 3000) return { slug: 'bieres', certainty: 0.3 };
  return { slug: 'spiritueux', certainty: 0 };
}

// ---------------------------------------------------------------------------
// Bottle label
// ---------------------------------------------------------------------------

const BOILERPLATE = /^(est\.?|since|depuis|fond[ée]e?|founded|product of|produit de|produce of|produced|bottled|mis en bouteille|appellation|contient|contains|sulfites|lot\b|ean\b|www\.|http|import|origine|origin|alc\.?|ingr[ée]dients?|a consommer|best before|recyclable|consigne|pour les femmes|enceinte|l'abus|drink responsibly)/i;
const SPIRIT_TYPE = /\b(whisk(e)?y|bourbon|scotch|vodka|gin|rhum|rum|cognac|armagnac|calvados|tequila|mezcal|brandy|liqueur|pastis|absinthe|single malt)\b/i;

/** Brands commonly found behind a French bar — used to fix OCR typos in the name ("AMESO" -> "Jameson"). */
const BRANDS = [
  'Jameson', 'Bushmills', 'Tullamore', 'Jack Daniel\'s', 'Johnnie Walker', 'Ballantine\'s', 'Chivas', 'Glenfiddich', 'Glenlivet',
  'Aberlour', 'Lagavulin', 'Laphroaig', 'Talisker', 'Oban', 'Nikka', 'Clan Campbell', 'Label 5', 'Grant\'s', 'Four Roses', 'Maker\'s Mark',
  'Jim Beam', 'Woodford', 'Bulleit', 'Absolut', 'Smirnoff', 'Grey Goose', 'Belvedere', 'Zubrowka', 'Eristoff', 'Ketel One',
  'Bacardi', 'Havana Club', 'Captain Morgan', 'Diplomatico', 'Zacapa', 'Kraken', 'Plantation', 'Damoiseau', 'Trois Rivieres',
  'Clement', 'Saint James', 'Bumbu', 'Don Papa', 'Bombay Sapphire', 'Tanqueray', 'Hendrick\'s', 'Beefeater', 'Gordon\'s',
  'Monkey 47', 'Citadelle', 'Botanist', 'Roku', 'Jose Cuervo', 'Patron', 'Olmeca', 'Sierra', 'Hennessy', 'Martell', 'Remy Martin',
  'Courvoisier', 'Ricard', 'Pernod', 'Pastis 51', 'Jagermeister', 'Get 27', 'Get 31', 'Cointreau', 'Grand Marnier', 'Baileys',
  'Kahlua', 'Malibu', 'Disaronno', 'Amaretto', 'Limoncello', 'Campari', 'Aperol', 'Martini', 'Lillet', 'Suze', 'Picon',
  'Chartreuse', 'Benedictine', 'Monin', 'Giffard', 'Teisseire', 'Routin', 'Angostura', 'Leffe', 'Kronenbourg', 'Heineken',
  'Grimbergen', 'Affligem', 'Desperados', 'Guinness', 'Chouffe', 'Pelforth', 'Carlsberg', 'Hoegaarden', 'Chimay', 'Duvel',
  'Karmeliet', 'Delirium', 'Goudale', 'Jupiler', 'Paulaner', 'Meteor', 'Corona', 'Brewdog', 'Tourtel', 'Schweppes', 'Orangina',
  'Perrier', 'Badoit', 'Evian', 'Vittel', 'Volvic', 'San Pellegrino', 'Coca-Cola', 'Pepsi', 'Red Bull', 'Fever-Tree', 'Oasis',
  'Lipton', 'Tropicana', 'Joker', 'Pago', 'Granini', 'Moet', 'Veuve Clicquot', 'Ruinart', 'Laurent-Perrier', 'Taittinger',
  'Mumm', 'Nicolas Feuillatte', 'Pommery', 'Bollinger', 'Krug',
];
/**
 * Tokens of multi-word brands that do not identify the brand on their own ("Four Roses" -> "roses"
 * would turn every « Rosé » into « Roses »). Only the distinctive token of a brand is used to fix
 * OCR typos; the full name is still recognised by extractBrand().
 */
const GENERIC_BRAND_TOKENS = new Set([
  'four', 'roses', 'makers', 'mark', 'grey', 'goose', 'club', 'morgan', 'trois', 'rivieres', 'saint', 'james',
  'papa', 'sapphire', 'walker', 'jack', 'label', 'martin', 'pastis', 'jose', 'grand', 'veuve', 'nicolas',
  'bull', 'clan', 'beam',
]);
const BRAND_INDEX = BRANDS.flatMap((b) => b.split(/\s+/)
  .map((t) => ({ key: norm(t).replace(/[^a-z0-9]/g, ''), display: t }))
  .filter((t) => t.key.replace(/[^a-z]/g, '').length >= 4 && !GENERIC_BRAND_TOKENS.has(t.key)));

/**
 * Ordinary words (French bar vocabulary, names) that sit within one or two letters of a brand:
 * read correctly by the OCR, they must be kept as printed (« Jus de Pomme » is not « Pommery »,
 * « Rosé » is not « Roses »).
 */
const NEVER_CORRECT = new Set([
  'rose', 'roses', 'pomme', 'pommes', 'marc', 'dark', 'sainte', 'page', 'sure', 'riviere', 'martine', 'poker',
  'granit', 'jupiter', 'duval', 'bullet', 'remi', 'serra', 'pichon',
  // Every French / English dictionary word (pyspellchecker 0.9.1 fr + en lists, 300k words,
  // normalised like the keys) that the rules below would still have turned into a brand, e.g.
  // grands→Grant's, billet→Lillet, élément→Clément, terrier→Perrier, tropical→Tropicana.
  // Regenerate with backend/scripts/brand-lookalikes.ts when BRANDS or the rules change.
  'absolue', 'absolus', 'affligea', 'affligee', 'affligees', 'affligent', 'affliger', 'affligera', 'affliges',
  'affligez', 'affligiez', 'angina', 'aperos', 'artel', 'bailees', 'ballantes', 'barleys', 'bellemere',
  'benedicite', 'benedictins', 'benediction', 'benedictions', 'billet', 'bordons', 'botanize', 'boulanger',
  'brants', 'bushnells', 'campobello', 'captais', 'captait', 'carnier', 'cement', 'chanteuse', 'charmeuse',
  'chartres', 'chartreux', 'chauffe', 'chinas', 'chives', 'citadels', 'clament', 'clemens', 'colliger',
  'cordons', 'corina', 'coronal', 'corons', 'courtoisie', 'danials', 'defeater', 'deliriez', 'delirious',
  'dillinger', 'diplomatics', 'diplomatie', 'diplomaties', 'diplomatist', 'donkey', 'element', 'eventree',
  'evertuee', 'faulkner', 'fenetree', 'feuillage', 'feuillant', 'feuillete', 'feuilletee', 'feuillette',
  'feuillettes', 'fillet', 'gainless', 'galantines', 'garants', 'gardons', 'geants', 'gerants', 'giants',
  'glibness', 'gluiness', 'gorgons', 'grafts', 'grands', 'granits', 'granta', 'granth', 'grimness', 'grunts',
  'guindees', 'habana', 'handpicks', 'haubaner', 'havanan', 'havane', 'honkey', 'implantation', 'jarlsberg',
  'jubiler', 'kendrick', 'kendricks', 'lactation', 'lazaretto', 'lepton', 'linton', 'liston', 'litton',
  'lutanist', 'manier', 'manquera', 'manquerai', 'manqueras', 'marier', 'marinier', 'marner', 'martela',
  'martele', 'martina', 'martins', 'marvell', 'matron', 'merrier', 'meson', 'millet', 'monkery', 'mordons',
  'natron', 'palisser', 'patrol', 'patroon', 'patton', 'pavana', 'period', 'perkier', 'perries', 'picard',
  'piler', 'placation', 'placentation', 'plantain', 'playstation', 'pointeau', 'pouliner', 'pranging',
  'ricardo', 'richard', 'rillet', 'ritard', 'romanist', 'routing', 'ruinait', 'ruinant', 'satanist',
  'schlepped', 'schlepper', 'schlepps', 'shivas', 'sierran', 'tanguera', 'tapisser', 'terrier', 'thinness',
  'tordons', 'tourtes', 'tropical', 'tropicale', 'tropicaux', 'velarium', 'verrier', 'votarist', 'willet',
  'woodward', 'woodwork', 'woodworm',
]);

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Allowed edit distance for a token / brand key pair: 1 from 6 letters, 2 from 8 letters, else exact. */
function maxBrandDistance(tokenLen: number, brandLen: number): number {
  const n = Math.min(tokenLen, brandLen);
  return n >= 8 ? 2 : n >= 6 ? 1 : 0;
}

/**
 * OCR often loses the first / last letter of a stylised brand ("AMESO" for JAMESON): a token of
 * 5+ letters found INSIDE a 7+ letter brand key, at most 2 letters short and not at its start
 * (a prefix is an ordinary word too often: « pomme » / Pommery), is that brand.
 */
function isEdgeTruncation(key: string, brandKey: string): boolean {
  if (key.length < 5 || brandKey.length < 7 || brandKey.length - key.length > 2 || key.length >= brandKey.length) return false;
  const at = brandKey.indexOf(key);
  return at > 0;
}

/** Replace OCR-mangled tokens by the closest known brand token. Returns the fixed text + hit flag. */
export function fixBrands(text: string): { text: string; hit: boolean } {
  let hit = false;
  const out = text.split(/(\s+)/).map((tok) => {
    const key = norm(tok).replace(/[^a-z0-9]/g, '');
    if (key.length < 4 || NEVER_CORRECT.has(key)) return tok;
    let best: { display: string; d: number } | null = null;
    for (const b of BRAND_INDEX) {
      if (b.key === key) { best = { display: b.display, d: 0 }; break; }
      // A word that starts a brand (« pomme » / Pommery) or a brand + plural/feminine ending
      // (« patrons » / Patron) is an ordinary word, not a misread brand.
      if (b.key.startsWith(key)) continue;
      if (key.startsWith(b.key) && /^(s|e|es|x)$/.test(key.slice(b.key.length))) continue;
      if (Math.abs(b.key.length - key.length) > 2) continue;
      let d = levenshtein(key, b.key);
      if (d > maxBrandDistance(key.length, b.key.length)) {
        if (!isEdgeTruncation(key, b.key)) continue;
        d = b.key.length - key.length;
      }
      if (!best || d < best.d) best = { display: b.display, d };
    }
    if (!best) return tok;
    hit = true;
    return best.d === 0 ? tok : best.display;
  });
  return { text: out.join(''), hit };
}

const BRAND_FULL = BRANDS.map((b) => ({ key: norm(b).replace(/[^a-z0-9 ]/g, ''), display: b }))
  .sort((a, b) => b.key.length - a.key.length);

/** Known brand contained in a (brand-fixed) product name, e.g. "Jameson Irish Whiskey" -> "Jameson". */
export function extractBrand(name: string): string | null {
  const n = ` ${norm(name).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `;
  for (const b of BRAND_FULL) {
    if (b.key.length >= 3 && n.includes(` ${b.key} `)) return b.display;
  }
  return null;
}

interface NameCandidate { text: string; conf: number; height: number; y0: number; y1: number }

export function pickProductName(lines: OcrLine[], slug: Slug): { name: string; conf: number; brand: boolean } {
  const cands: NameCandidate[] = [];
  for (const l of lines) {
    const text = cleanText(l.text);
    const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, '').length;
    if (letters < 3 || letters / Math.max(1, text.replace(/\s/g, '').length) < 0.6) continue;
    if (l.conf < 45) continue;
    if (BOILERPLATE.test(norm(text))) continue;
    if (/^\W*\d{4}\W*$/.test(text)) continue; // vintage
    if (extractVolumeCl(text) !== null && letters < 6) continue; // "70 cl"
    // Need one real word (>= 4 letters) or a known brand; drops OCR debris like "DEs", "Ee".
    if (!/[A-Za-zÀ-ÿ]{4,}/.test(text) && !fixBrands(text).hit) continue;
    cands.push({ text, conf: l.conf, height: l.height, y0: l.y0, y1: l.y1 });
  }
  if (!cands.length) return { name: '', conf: 0, brand: false };
  const byHeight = [...cands].sort((a, b) => b.height * (b.conf / 100) - a.height * (a.conf / 100));
  const top = byHeight[0];
  // Merge vertically adjacent lines of similar size ("CHÂTEAU" / "LES OLLIEUX", "HERBE DES" / "DRUIDES").
  const ordered = [...cands].sort((a, b) => a.y0 - b.y0);
  const idx = ordered.indexOf(top);
  const used: NameCandidate[] = [top];
  const similar = (c: NameCandidate) => c.height >= top.height * 0.68 && c.height <= top.height * 1.5;
  for (let i = idx - 1; i >= 0; i--) {
    const c = ordered[i];
    if (!similar(c) || used[0].y0 - c.y1 > top.height * 1.3) break;
    used.unshift(c);
  }
  for (let i = idx + 1; i < ordered.length; i++) {
    const c = ordered[i];
    const last = used[used.length - 1];
    if (!similar(c) || c.y0 - last.y1 > top.height * 1.3) break;
    used.push(c);
  }
  let name = used.slice(0, 3).map((u) => smartCase(u.text)).join(' ');
  // Brand alone is ambiguous for spirits: append the type line ("JAMESON" + "IRISH WHISKEY").
  if (slug === 'spiritueux' && !SPIRIT_TYPE.test(name)) {
    const typeLine = ordered.find((c) => !used.includes(c) && SPIRIT_TYPE.test(c.text) && c.height >= top.height * 0.3 && c.text.length <= 40);
    if (typeLine) { name = `${name} ${smartCase(typeLine.text)}`; used.push(typeLine); }
  }
  const conf = used.reduce((a, u) => a + u.conf, 0) / used.length;
  const fixed = fixBrands(cleanText(name));
  return { name: fixed.text.slice(0, 100), conf, brand: fixed.hit };
}

interface BottleRead {
  name: string; nameConf: number; brand: boolean;
  volume: number | null; abv: number | null; price: number | null;
  slug: Slug; certainty: number; text: string;
}

function readBottle(page: OcrPage): { value: BottleRead; quality: number } {
  const text = page.text;
  const volume = extractVolumeCl(text);
  const abv = extractAbv(text);
  const price = extractPrice(text);
  const cat = detectCategory(text, abv, volume);
  const { name, conf, brand } = pickProductName(page.lines, cat.slug);
  const quality = (name ? 0.35 * (conf / 100) + (brand ? 0.1 : 0) : 0)
    + (volume !== null ? 0.2 : 0) + (abv !== null ? 0.2 : 0) + 0.15 * cat.certainty;
  return { value: { name, nameConf: conf, brand, volume, abv, price, slug: cat.slug, certainty: cat.certainty, text }, quality };
}

/** Most frequent non-null value across passes (ties -> best quality pass first). */
function vote<T>(passes: PassResult<BottleRead>[], pick: (r: BottleRead) => T | null): T | null {
  const counts = new Map<T, number>();
  for (const p of passes) {
    const v = pick(p.value);
    if (v !== null) counts.set(v, (counts.get(v) || 0) + 1 + p.quality);
  }
  let best: T | null = null;
  let bestN = 0;
  for (const [v, n] of counts) if (n > bestN) { best = v; bestN = n; }
  return best;
}

/**
 * Analyze a bottle / can label photo (free OCR, up to 7 passes, stops at the first good read).
 * The client sends a JPEG ~1024 px wide; 1280-1600 px gives better results on small text.
 */
export async function analyzeBottleImage(imageBase64: string, signal?: AbortSignal): Promise<ScanResult> {
  const image = decodeImage(imageBase64, MAX_SIDE_BOTTLE);
  const passes = await ocrPasses(image, PSM.SPARSE_TEXT, BOTTLE_TIMEOUT_MS, BOTTLE_PASSES, readBottle, 0.8, signal);
  const ranked = [...passes].sort((a, b) => b.quality - a.quality);
  const best = ranked[0].value;
  const volume = best.volume ?? vote(passes, (r) => r.volume);
  let name = best.name || ranked.find((p) => p.value.name)?.value.name || '';
  // Another good pass that read the same name further (« MARC DE » vs « MARC DE BOURGOGNE »,
  // « Jameson » vs « Jameson Irish Whiskey »): keep the longer reading.
  if (name) {
    const base = norm(name);
    const longer = ranked.find((p) => p.quality >= ranked[0].quality - 0.15
      && norm(p.value.name).startsWith(`${base} `)
      && p.value.name.split(/\s+/).length - name.split(/\s+/).length <= 3);
    if (longer) name = longer.value.name;
  }
  // An ABV on its own is not a usable read (one OCR noise token such as "2%" is enough to
  // produce it): without a name or a volume the scan is a failure (422, quota not counted).
  if (!name && volume === null) {
    console.log(`[SCAN] OCR ${passes.length} pass(es) ${passes.reduce((a, p) => a + p.ms, 0)} ms [${passes.map((p) => `${p.pass}:${round2(p.quality)}`).join(' ')}] -> nothing usable`);
    throw new OcrError('Lecture impossible : aucun texte lisible sur la photo. Cadrez l’étiquette de face, bien éclairée et nette, puis réessayez — ou remplissez la fiche à la main.', 'empty');
  }
  // Without a name, a bare "N %" is too likely to be noise: keep only an ABV printed with its
  // context ("% vol", "alc", "°"), and never guess the category from a noise percentage.
  let abv = best.abv ?? vote(passes, (r) => r.abv);
  if (!name && abv !== null && extractAbvStrict(passes.map((p) => p.value.text).join('\n')) === null) abv = null;
  const price = best.price ?? vote(passes, (r) => r.price);
  const cat = detectCategory(passes.map((p) => p.value.text).join('\n'), abv, volume);

  let confidence = 0;
  if (name) {
    confidence = 0.4 * (best.nameConf / 100) + (best.brand ? 0.1 : 0)
      + (volume !== null ? 0.15 : 0) + (abv !== null ? 0.15 : 0) + 0.15 * cat.certainty;
  }
  confidence = round2(Math.min(0.95, confidence));
  const totalMs = passes.reduce((a, p) => a + p.ms, 0);
  console.log(`[SCAN] OCR ${passes.length} pass(es) ${totalMs} ms [${passes.map((p) => `${p.pass}:${round2(p.quality)}`).join(' ')}] -> "${name}" ${cat.slug} ${volume ?? '?'}cl ${abv ?? '?'}% conf=${confidence}`);

  return {
    name,
    brand: name ? extractBrand(name) : null,
    category: cat.slug,
    containerVolumeCl: volume,
    alcoholDegree: abv,
    estimatedPriceHT: price,
    confidence,
    raw: ranked[0].value.text.slice(0, RAW_MAX_CHARS),
  };
}

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------

const AMOUNT_RE = /(?<![\w,.])(-?\d{1,3}(?:[ \u202f.]\d{3})+[.,]\d{2,3}|-?\d{1,6}[.,]\d{2,3})(?:\s?€)?(?![\w,.%°])/g;
const AMOUNT_TEST = new RegExp(AMOUNT_RE.source);
const NON_PRODUCT = /\b(total|sous[- ]?total|montant|tva|t\.v\.a|net a payer|reste a payer|a payer|acompte|remise|escompte|frais|port|livraison|transport|consigne|deconsigne|eco[- ]?(participation|contribution)|droits? d'?accises?|css|cotisation|timbre|base ht|report|solde|iban|bic|rib|siret|capital|penalites|paiement|reglement|echeance|page \d)\b/;
const HEADER_ROW = /\b(designation|libelle|description|article|produit)\b.*\b(qte|quantite|qty|pu|prix|montant)\b/;
const HEADER_EXCLUDE = /(factur|invoice|avoir|devis|bon de (livraison|commande)|\bn[°o]\b|date|client|page|siret|siren|\btva\b|t[ée]l|fax|e-?mail|@|www|iban|rcs|capital|\bape\b|naf)/i;

const MONTHS: Record<string, number> = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
  janv: 1, fevr: 2, fev: 2, avr: 4, juil: 7, sept: 9, oct: 10, nov: 11, dec: 12,
};

function isoDate(d: number, m: number, y: number): string | null {
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function extractInvoiceDate(text: string): string | null {
  const t = fixDigits(norm(text));
  const NUM = /(\d{1,2})\s?[/.-]\s?(\d{1,2})\s?[/.-]\s?(\d{4}|\d{2})(?!\d)/;
  const labelled = t.match(new RegExp(`(?<!echeance\\s|livraison\\s|limite\\s)date(?:\\s+(?:de\\s+(?:la\\s+)?)?facture|\\s+facturation)?\\s*[:.]?\\s*(?:le\\s+)?${NUM.source}`));
  if (labelled) {
    const r = isoDate(+labelled[1], +labelled[2], +labelled[3]);
    if (r) return r;
  }
  const g = new RegExp(NUM.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = g.exec(t))) {
    const r = isoDate(+m[1], +m[2], +m[3]);
    if (r) return r;
  }
  const txt = t.match(/(\d{1,2})\s+(janv(?:ier)?|f[e]vr?(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|aout|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|dec(?:embre)?)\.?\s+(\d{4})/);
  if (txt) {
    const mo = MONTHS[txt[2]] ?? MONTHS[txt[2].slice(0, 4)] ?? MONTHS[txt[2].slice(0, 3)];
    if (mo) return isoDate(+txt[1], mo, +txt[3]);
  }
  return null;
}

export function extractSupplier(lines: OcrLine[]): string {
  if (!lines.length) return '';
  const pageBottom = Math.max(...lines.map((l) => l.y1));
  const header = lines.filter((l) => l.y1 <= pageBottom * 0.35);
  let best: { text: string; score: number } | null = null;
  for (const l of header) {
    for (const seg of l.text.split(/\s{3,}/)) {
      const text = cleanText(seg);
      const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, '').length;
      if (letters < 3 || HEADER_EXCLUDE.test(text) || l.conf < 50) continue;
      if (/^\d/.test(text) || /\b\d{5}\b/.test(text)) continue; // street / postcode lines
      const score = l.height * (l.conf / 100) - l.y0 / Math.max(1, pageBottom) * 10;
      if (!best || score > best.score) best = { text, score };
    }
  }
  return best ? smartCase(best.text).slice(0, 100) : '';
}

const PACK_RES = [
  /(?:^|\s)(?:x|×)\s?(\d{1,3})(?!\s?(?:cl|ml|l)\b)(?![\d.,])/i, // "x24"
  /(?:^|\s)(\d{1,3})\s?(?:x|×)\s?\d+(?:[.,]\d+)?\s?(?:cl|ml|l)\b/i, // "24x33cl"
  /\b(?:pack|carton|caisse|colis|lot|bte|boite|boîte|cs)\s?(?:de\s)?(\d{1,3})\b/i, // "carton de 6"
];

interface ParsedRow { name: string; qty: number | null; unit: number | null; total: number | null; consistent: boolean; pack: number | null }

/** Parse one invoice row: designation + qty + unit price (+ total), in any column order. */
export function parseInvoiceRow(rawLine: string): ParsedRow | null {
  const line = fixDigits(rawLine);
  const amounts: { v: number; idx: number }[] = [];
  AMOUNT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AMOUNT_RE.exec(line))) amounts.push({ v: parseNum(m[1]), idx: m.index });
  if (!amounts.length) return null;

  // Designation = leading text segment (columns are separated by 3+ spaces thanks to preserve_interword_spaces).
  const segments = line.split(/\s{3,}/).map((s) => s.trim()).filter(Boolean);
  let designation = segments[0] || '';
  if (segments.length === 1 || AMOUNT_TEST.test(designation)) {
    // No column gaps: cut before the trailing run of numbers.
    const cut = line.search(/\s(?:[a-z]?\d{1,4}[a-z]?\s+)?(?:-?\d[\d \u202f.]*[.,]\d{2,3}(?:\s?€)?\s*){1,4}$/i);
    designation = cut > 0 ? line.slice(0, cut) : line.slice(0, amounts[0].idx);
  }
  designation = designation.replace(/^\s*(?:r[ée]f\.?|art\.?|code)?\s*[A-Z]{0,3}\d{4,}[A-Z0-9-]*\s+/i, '');
  const letters = designation.replace(/[^A-Za-zÀ-ÿ]/g, '').length;
  if (letters < 3) return null;

  // Integer candidates for the quantity (tolerate one stray letter: "a2", "6x").
  const rest = segments.slice(1).join('   ');
  const ints: number[] = [];
  for (const s of rest.split(/\s+/)) {
    const q = s.match(/^[a-zA-Z|]?(\d{1,4})[a-zA-Z|]?$/);
    if (q && !/[.,]/.test(s)) ints.push(parseInt(q[1], 10));
  }

  const vals = amounts.map((a) => a.v).filter((v) => v > 0);
  let qty: number | null = null;
  let unit: number | null = null;
  let total: number | null = null;
  let consistent = false;
  // Find (qty, unit, total) with qty × unit ≈ total.
  outer: for (let i = 0; i < vals.length; i++) {
    for (let j = 0; j < vals.length; j++) {
      if (i === j || vals[j] < vals[i]) continue;
      const k = vals[j] / vals[i];
      const kr = Math.round(k);
      if (kr >= 1 && kr <= 999 && Math.abs(k - kr) <= 0.015 * kr + 0.005) {
        if (ints.length && !ints.includes(kr) && !(kr === 1 && vals[i] === vals[j])) continue;
        qty = kr; unit = vals[i]; total = vals[j]; consistent = true;
        break outer;
      }
    }
  }
  if (!consistent) {
    // Try again ignoring the printed integers (OCR may have garbled the quantity column).
    outer2: for (let i = 0; i < vals.length; i++) {
      for (let j = 0; j < vals.length; j++) {
        if (i === j || vals[j] <= vals[i]) continue;
        const k = vals[j] / vals[i];
        const kr = Math.round(k);
        if (kr >= 2 && kr <= 999 && Math.abs(k - kr) <= 0.01 * kr) {
          qty = kr; unit = vals[i]; total = vals[j]; consistent = true;
          break outer2;
        }
      }
    }
  }
  if (!consistent) {
    unit = vals.length >= 2 ? vals[vals.length - 2] : vals[0] ?? null;
    total = vals.length >= 2 ? vals[vals.length - 1] : null;
    qty = ints.length ? ints[0] : 1;
  }

  let pack: number | null = null;
  for (const re of PACK_RES) {
    const p = designation.match(re);
    if (p) {
      const n = parseInt(p[1], 10);
      if (n >= 2 && n <= 60) { pack = n; designation = designation.replace(p[0], ' '); break; }
    }
  }
  return { name: designation, qty, unit, total, consistent, pack };
}

function cleanProductName(designation: string): string {
  return cleanText(
    fixDigits(designation)
      .replace(VOLUME_RE, ' ')
      .replace(/\b\d{1,2}(?:[.,]\d{1,2})?\s?(?:%|°)\s?(?:vol\.?)?/gi, ' ')
      .replace(/\s{2,}/g, ' '),
  ).slice(0, 100);
}

/**
 * Analyze a supplier invoice photo (free OCR). Extracts supplier, date and product rows.
 * Unit prices are HT per container: "x24" / "carton de 6" packs are divided down.
 */
export async function analyzeInvoiceImage(imageBase64: string, signal?: AbortSignal): Promise<InvoiceScanResult> {
  const image = decodeImage(imageBase64, MAX_SIDE_INVOICE);
  const passes = await ocrPasses(image, PSM.SINGLE_COLUMN, INVOICE_TIMEOUT_MS, INVOICE_PASSES, readInvoice, 0.75, signal);
  const best = [...passes].sort((a, b) => b.quality - a.quality)[0];
  const r = best.value;
  const totalMs = passes.reduce((a, p) => a + p.ms, 0);
  console.log(`[SCAN-INVOICE] OCR ${passes.length} pass(es) ${totalMs} ms [${passes.map((p) => `${p.pass}:${round2(p.quality)}`).join(' ')}] -> ${r.supplier || '?'} ${r.invoiceDate || '?'} ${r.products.length} lignes`);
  if (!r.products.length) {
    throw new OcrError('Lecture impossible : aucune ligne de produit reconnue sur la facture. Photographiez la facture à plat, en entier, bien éclairée et sans reflet, puis réessayez.', 'empty');
  }
  return { ...r, supplier: r.supplier || 'Fournisseur inconnu', raw: r.raw.slice(0, RAW_MAX_CHARS) };
}

function readInvoice(page: OcrPage): { value: InvoiceScanResult; quality: number } {
  const supplier = extractSupplier(page.lines);
  const invoiceDate = extractInvoiceDate(page.text);
  const products: InvoiceProduct[] = [];
  let consistent = 0;
  for (const l of page.lines) {
    if (HEADER_ROW.test(norm(l.text))) continue;
    const row = parseInvoiceRow(l.text);
    if (!row) continue;
    if (NON_PRODUCT.test(norm(row.name))) continue;
    const volume = extractVolumeCl(row.name);
    const abv = extractAbv(row.name);
    const cat = detectCategory(row.name, abv, volume);
    let unit = row.unit;
    let qty = row.qty ?? 1;
    if (row.pack && unit !== null && (volume === null || volume <= 150)) {
      unit = unit / row.pack;
      qty *= row.pack;
    }
    const name = smartCase(fixBrands(cleanProductName(row.name)).text);
    if (name.replace(/[^A-Za-zÀ-ÿ]/g, '').length < 3) continue;
    if (row.consistent) consistent++;
    const confidence = round2(Math.min(0.95,
      (l.conf / 100) * (row.consistent ? 1 : 0.7) * (unit !== null ? 1 : 0.5) * (0.85 + 0.15 * cat.certainty)));
    products.push({
      name,
      category: cat.slug,
      containerVolumeCl: volume,
      purchasePriceHT: unit !== null ? Math.round(unit * 1000) / 1000 : null,
      quantity: qty,
      alcoholDegree: abv,
      confidence,
    });
  }
  const meanConf = products.length ? products.reduce((a, p) => a + p.confidence, 0) / products.length : 0;
  const quality = products.length ? 0.6 * meanConf + 0.4 * (consistent / products.length) : 0;
  return { value: { supplier, invoiceDate, products, raw: page.text }, quality };
}
