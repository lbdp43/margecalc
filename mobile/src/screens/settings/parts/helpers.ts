/**
 * Shared helpers for the Réglages area: readable API errors, small text and
 * date utilities. Service icons come from components/ui/ServingTypeIcon
 * (`servingIconName`), the one mapping shared with the product screens.
 */
import { Linking } from 'react-native';
import { isOnline } from '../../../services/offline';
import { formatNumber, NBSP } from '../../../utils/format';

/** Official reference for the alcohol duties (service-public.fr). */
export const OFFICIAL_RATES_URL = 'https://entreprendre.service-public.fr/vosdroits/F32101';
export const BREWERY_URL = 'https://labrasseriedesplantes.fr/';
export const CONTACT_EMAIL = 'labrasseriedesplantes@gmail.com';
export const APP_VERSION = '3.14';

const OFFLINE_MESSAGE = 'Hors ligne : vérifiez votre connexion puis réessayez.';

export interface ReadableError {
  /** French sentence to show as is (the backend's `error` when there is one). */
  message: string;
  /** Field → message, from the backend's `details`. */
  fields: Record<string, string>;
  offline: boolean;
  status?: number;
}

/** Turns an axios error into a readable French message (+ per-field messages). */
export function readableError(err: unknown, fallback: string): ReadableError {
  const e = err as { response?: { status?: number; data?: any }; message?: string; code?: string };
  const fields: Record<string, string> = {};
  if (!e?.response) {
    const offline = !isOnline() || e?.code === 'ERR_NETWORK' || /network/i.test(e?.message ?? '');
    if (offline) return { message: OFFLINE_MESSAGE, fields, offline: true };
    if (e?.code === 'ECONNABORTED') return { message: 'Le serveur met trop de temps à répondre. Réessayez.', fields, offline: false };
    return { message: fallback, fields, offline: false };
  }
  const data = e.response.data;
  const details: any[] = Array.isArray(data?.details) ? data.details : [];
  for (const d of details) {
    if (d && typeof d.field === 'string' && typeof d.message === 'string' && !fields[d.field]) fields[d.field] = d.message;
  }
  const status = e.response.status ?? 0;
  let message = typeof data?.error === 'string' && data.error.trim() ? data.error : fallback;
  // A bare « Erreur serveur » says less than the screen's own sentence.
  if (status >= 500 && /^erreur serveur\.?$/i.test(message.trim())) message = `${fallback} Réessayez dans un instant.`;
  return { message, fields, offline: false, status };
}

/** Lower case without accents (« Bière » → « biere »), for searches and duplicate checks. */
export const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Same name, ignoring case, accents and extra spaces. */
export const sameName = (a: string, b: string) => strip(a.replace(/\s+/g, ' ').trim()) === strip(b.replace(/\s+/g, ' ').trim());

/** Accent- and case-insensitive « contains ». */
export function matches(haystack: Array<string | null | undefined>, query: string): boolean {
  const q = strip(query.trim());
  if (!q) return true;
  return haystack.some((h) => (h ? strip(h).includes(q) : false));
}

/** « 65 % » or « 67,5 % » (thresholds, no useless decimal). */
export function formatThreshold(n: number): string {
  return `${formatNumber(n, Number.isInteger(n) ? 0 : 1)}${NBSP}%`;
}

/** « 22/10/2026 » */
export function formatDate(iso: string | number | Date | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '–';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** « 22/10/2026 à 09:12 » */
export function formatDateTime(iso: string | number | Date | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '–';
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${formatDate(d)} à ${time}`;
}

/** « 22 octobre 2026 » */
export function formatLongDate(iso: string | null | undefined): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '–' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** « 22 oct. » this year, « 22 oct. 2025 » before. */
export function formatCompactDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('fr-FR', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

/** « 22 oct. à 09:12 » */
export function formatShortDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** « à l’instant », « il y a 5 min », « il y a 3 j »… */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'jamais';
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (!isFinite(diffMin)) return 'jamais';
  if (diffMin < 1) return 'à l’instant';
  if (diffMin < 60) return `il y a ${diffMin}${NBSP}min`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `il y a ${h}${NBSP}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d}${NBSP}j`;
  if (d < 30) return `il y a ${Math.floor(d / 7)}${NBSP}sem.`;
  if (d < 365) return `il y a ${Math.floor(d / 30)}${NBSP}mois`;
  const y = Math.floor(d / 365);
  return `il y a ${y}${NBSP}an${y > 1 ? 's' : ''}`;
}

/** Opens an external link; returns false when it could not be opened. */
export async function openExternal(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
