/**
 * Invoice flow (« Scanner une facture »):
 *   POST /api/scan/invoice     { imageBase64 } → InvoiceScanResult (free OCR, ~2 000 px JPEG)
 *   POST /api/products/import  { supplier?, lines } → ImportProductsResult (per-line results)
 *
 * The backend's `error` is always a readable French sentence: it is shown as is.
 * Failures never throw raw axios errors at the screen: `describeInvoiceScanError`
 * and `describeImportError` turn them into a calm title + message.
 */
import type {
  ImportLineResult,
  ImportProductLine,
  ImportProductsResult,
  InvoiceScanResult,
} from '@margebar/shared';
import { api } from './api';
import { OfflineError, isNetworkError, isOnline, isTimeoutError } from './offline';

export type { ImportLineResult, ImportProductLine, ImportProductsResult, InvoiceScanResult };

// ─── Scan ──────────────────────────────────────────────────────────────────

export interface ScanInvoiceOptions {
  /** Abort the request (« Annuler » while reading). */
  signal?: AbortSignal;
  /** 0..1 while the image is being sent (web XHR / native). */
  onUploadProgress?: (ratio: number) => void;
}

/** Reads an invoice photo. `imageBase64` is raw base64 or a data URI (JPEG, long side ≤ 3 500 px). */
export async function scanInvoice(imageBase64: string, opts: ScanInvoiceOptions = {}): Promise<InvoiceScanResult> {
  if (!isOnline()) throw new OfflineError('Pas de connexion : la lecture de la facture a besoin d’internet.');
  const res = await api.post<InvoiceScanResult>(
    '/scan/invoice',
    { imageBase64 },
    {
      timeout: 150000,
      signal: opts.signal,
      onUploadProgress: (e) => {
        if (!opts.onUploadProgress) return;
        const total = e.total ?? 0;
        if (total > 0) opts.onUploadProgress(Math.min(1, e.loaded / total));
      },
    },
  );
  const data = res.data;
  return {
    supplier: typeof data?.supplier === 'string' ? data.supplier : '',
    invoiceDate: typeof data?.invoiceDate === 'string' ? data.invoiceDate : null,
    products: Array.isArray(data?.products) ? data.products : [],
    raw: typeof data?.raw === 'string' ? data.raw : '',
  };
}

export type InvoiceScanErrorKind =
  | 'unreadable' // 422 empty / bad_image: take another photo
  | 'engine' // 422 timeout / busy / engine: the same photo can be sent again
  | 'cooldown' // 429 cooldown (Retry-After)
  | 'busy' // 429 burst limit
  | 'quota' // 429 daily quota: no retry today
  | 'too_big' // 413
  | 'offline'
  | 'timeout'
  | 'cancelled'
  | 'server';

export interface InvoiceScanErrorInfo {
  kind: InvoiceScanErrorKind;
  title: string;
  /** The backend's sentence as is, or our own when there was no answer. */
  message: string;
  /** « Réessayer » sends the SAME photo again (false: take another photo). */
  resend: boolean;
  /** False when nothing can be retried today (quota). */
  canRetry: boolean;
  /** Seconds to wait before retrying (cooldown / busy), when the API says so. */
  retryAfterSec?: number;
}

function serverError(err: any): string | null {
  const body = err?.response?.data;
  return typeof body?.error === 'string' && body.error.trim() ? body.error.trim() : null;
}

function retryAfter(err: any): number | undefined {
  const h = err?.response?.headers?.['retry-after'];
  const n = typeof h === 'string' ? parseInt(h, 10) : typeof h === 'number' ? h : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 3600) : undefined;
}

export function isCancelled(err: any): boolean {
  return !!err && (err.name === 'CanceledError' || err.code === 'ERR_CANCELED' || err.name === 'AbortError');
}

/** Any scan failure → a readable card (never raw JSON). */
export function describeInvoiceScanError(err: any): InvoiceScanErrorInfo {
  if (isCancelled(err)) {
    return { kind: 'cancelled', title: 'Lecture annulée', message: 'La lecture a été interrompue.', resend: true, canRetry: true };
  }
  const status: number | undefined = err?.response?.status;
  const code: string | undefined = err?.response?.data?.code;
  const msg = serverError(err);

  if (!err?.response) {
    if (err instanceof OfflineError || !isOnline() || isNetworkError(err)) {
      return {
        kind: 'offline',
        title: 'Pas de connexion',
        message: 'La lecture de la facture a besoin d’internet. Vérifiez votre connexion, puis réessayez : la photo est gardée.',
        resend: true,
        canRetry: true,
      };
    }
    if (isTimeoutError(err)) {
      return {
        kind: 'timeout',
        title: 'La lecture a pris trop de temps',
        message: 'Le serveur n’a pas répondu à temps. Réessayez, ou reprenez une photo plus nette de la facture.',
        resend: true,
        canRetry: true,
      };
    }
  }
  if (status === 429) {
    if (code === 'quota') {
      return { kind: 'quota', title: 'Limite du jour atteinte', message: msg ?? 'Limite de lectures du jour atteinte. Vous pouvez saisir vos produits à la main.', resend: false, canRetry: false };
    }
    if (code === 'cooldown') {
      return {
        kind: 'cooldown',
        title: 'Lecture en pause',
        message: msg ?? 'Plusieurs lectures ont échoué d’affilée. Patientez quelques minutes, puis réessayez.',
        resend: true,
        canRetry: true,
        retryAfterSec: retryAfter(err),
      };
    }
    return { kind: 'busy', title: 'Un instant', message: msg ?? 'Trop de lectures d’affilée. Réessayez dans une minute.', resend: true, canRetry: true, retryAfterSec: retryAfter(err) };
  }
  if (status === 413) {
    return { kind: 'too_big', title: 'Photo trop volumineuse', message: msg ?? 'Photo trop volumineuse. Choisissez une autre image.', resend: false, canRetry: true };
  }
  if (status === 422 || status === 400) {
    const sameImage = code === 'timeout' || code === 'busy' || code === 'engine';
    return {
      kind: sameImage ? 'engine' : 'unreadable',
      title: sameImage ? 'Lecture interrompue' : 'Facture illisible',
      message: msg ?? 'Lecture impossible : photographiez la facture à plat, en entier et bien éclairée.',
      resend: sameImage,
      canRetry: true,
    };
  }
  return {
    kind: 'server',
    title: 'Lecture indisponible',
    message: msg ?? 'Le service de lecture ne répond pas pour le moment. Réessayez dans un instant.',
    resend: true,
    canRetry: true,
  };
}

// ─── Import ────────────────────────────────────────────────────────────────

/** The API answered 422: nothing was imported, but every line has its own result. */
export interface ImportNothingResult extends ImportProductsResult {
  error: string;
}

/**
 * Imports the lines. Resolves with the per-line results, including when the API
 * answered 422 « Aucun produit n’a pu être importé » (every line failed): the
 * screen shows each line's error either way. Throws for whole-request failures
 * (offline, timeout, 400, 429, 5xx).
 */
export async function importInvoiceLines(
  input: { supplier?: string | null; lines: ImportProductLine[] },
): Promise<ImportProductsResult & { error?: string }> {
  if (!isOnline()) throw new OfflineError('Pas de connexion : rien n’a été importé. Réessayez une fois connecté, les lignes restent ici.');
  try {
    const res = await api.post<ImportProductsResult>('/products/import', input, { timeout: 60000 });
    return res.data;
  } catch (err: any) {
    const body = err?.response?.data;
    if (err?.response?.status === 422 && Array.isArray(body?.results)) {
      return body as ImportNothingResult;
    }
    throw err;
  }
}

export interface ImportErrorInfo {
  title: string;
  message: string;
  offline: boolean;
}

/** Whole-request import failure → dialog copy (the backend's sentence as is). */
export function describeImportError(err: any): ImportErrorInfo {
  if (err instanceof OfflineError || (!err?.response && (!isOnline() || isNetworkError(err)))) {
    return {
      title: 'Pas de connexion',
      message: 'Rien n’a été importé. Vérifiez votre connexion, puis réessayez : vos lignes et vos corrections sont gardées.',
      offline: true,
    };
  }
  if (!err?.response && isTimeoutError(err)) {
    return {
      title: 'Le serveur ne répond pas',
      message: 'L’import a pris trop de temps. Réessayez : un produit déjà importé ne sera pas créé en double.',
      offline: false,
    };
  }
  const status: number | undefined = err?.response?.status;
  const msg = serverError(err);
  if (msg) return { title: 'Import impossible', message: msg, offline: false };
  if (status === 429) return { title: 'Import impossible', message: 'Trop de demandes d’affilée. Patientez quelques secondes, puis réessayez.', offline: false };
  if (status === 401) return { title: 'Session expirée', message: 'Reconnectez-vous pour importer vos produits.', offline: false };
  return { title: 'Import impossible', message: 'Le serveur a rencontré un problème. Réessayez dans un instant.', offline: false };
}
