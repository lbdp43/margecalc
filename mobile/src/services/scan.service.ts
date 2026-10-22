import type { BottleScanResult, ScanCategorySlug } from '@margebar/shared';
import { api } from './api';
import { isNetworkError, isOnline, isTimeoutError } from './offline';

/**
 * Free OCR (Tesseract on the server). Send a ~1 600 px JPEG for bottles and
 * ~2 000 px for invoices, as raw base64 or a data URI. A failed read answers
 * 422 { error: 'Lecture impossible : …', code } and does NOT use the quota.
 */

/** Bottle scan result (`POST /api/scan/bottle`). Kept as `ScanResult` for older imports. */
export type ScanResult = BottleScanResult;

export async function scanBottle(imageBase64: string): Promise<BottleScanResult> {
  const res = await api.post<BottleScanResult>('/scan/bottle', { imageBase64 }, { timeout: 90000 });
  return res.data;
}

export interface ScanQuota {
  limit: number;
  used: number;
  remaining: number;
}

/** Daily scan quota (`GET /api/scan/quota`). */
export async function getScanQuota(): Promise<ScanQuota> {
  const res = await api.get<ScanQuota>('/scan/quota', { timeout: 8000 });
  return res.data;
}

export interface InvoiceProduct {
  name: string;
  category: ScanCategorySlug | string;
  containerVolumeCl: number | null;
  purchasePriceHT: number | null;
  quantity: number;
  alcoholDegree?: number | null;
  confidence: number;
}

export interface InvoiceScanResult {
  supplier: string;
  invoiceDate: string | null;
  products: InvoiceProduct[];
  raw?: string;
}

export async function scanInvoice(imageBase64: string): Promise<InvoiceScanResult> {
  const res = await api.post<InvoiceScanResult>('/scan/invoice', { imageBase64 }, { timeout: 150000 });
  return res.data;
}

export type ScanErrorKind = 'unreadable' | 'quota' | 'cooldown' | 'busy' | 'too_big' | 'offline' | 'timeout' | 'server';

export interface ScanErrorInfo {
  kind: ScanErrorKind;
  /** Short title for the error card. */
  title: string;
  /** The backend's readable French sentence (shown as is), or our own when there was no answer. */
  message: string;
  /** True when trying again later can work. */
  retryable: boolean;
}

/** Turns any scan failure into a calm, readable card (never raw JSON). */
export function describeScanError(err: any): ScanErrorInfo {
  const status: number | undefined = err?.response?.status;
  const body = err?.response?.data;
  const serverMessage = typeof body?.error === 'string' && body.error.trim() ? body.error.trim() : null;
  const code: string | undefined = body?.code;

  if (!err?.response) {
    if (!isOnline() || isNetworkError(err)) {
      return {
        kind: 'offline',
        title: 'Pas de connexion',
        message: 'La lecture de l’étiquette a besoin d’internet. Vous pouvez continuer et remplir la fiche à la main.',
        retryable: true,
      };
    }
    if (isTimeoutError(err)) {
      return {
        kind: 'timeout',
        title: 'La lecture a pris trop de temps',
        message: 'Le serveur n’a pas répondu à temps. Réessayez avec une photo plus nette, ou continuez à la main.',
        retryable: true,
      };
    }
  }
  if (status === 429) {
    if (code === 'quota') {
      return { kind: 'quota', title: 'Limite du jour atteinte', message: serverMessage ?? 'Limite de scans du jour atteinte.', retryable: false };
    }
    if (code === 'cooldown') {
      return { kind: 'cooldown', title: 'Lecture en pause', message: serverMessage ?? 'Trop de photos illisibles d’affilée, réessayez dans quelques minutes.', retryable: true };
    }
    return { kind: 'busy', title: 'Un instant', message: serverMessage ?? 'Trop de scans d’affilée, réessayez dans 1 minute.', retryable: true };
  }
  if (status === 413) {
    return { kind: 'too_big', title: 'Photo trop volumineuse', message: serverMessage ?? 'Photo trop volumineuse.', retryable: true };
  }
  if (status === 422 || status === 400) {
    return {
      kind: 'unreadable',
      title: 'Étiquette illisible',
      message: serverMessage ?? 'Lecture impossible : reprenez la photo de face, bien éclairée.',
      retryable: true,
    };
  }
  return {
    kind: 'server',
    title: 'Lecture indisponible',
    message: serverMessage ?? 'Le service de lecture ne répond pas pour le moment. Vous pouvez continuer à la main.',
    retryable: true,
  };
}
