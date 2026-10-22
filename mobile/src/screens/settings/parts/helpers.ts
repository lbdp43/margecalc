/**
 * Shared helpers for the Réglages area: readable API errors, icons for
 * services, small text utilities.
 */
import { Linking } from 'react-native';
import type { IconName } from '../../../components/ui';
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
  const message = typeof data?.error === 'string' && data.error.trim() ? data.error : fallback;
  return { message, fields, offline: false, status: e.response.status };
}

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Accent- and case-insensitive « contains ». */
export function matches(haystack: Array<string | null | undefined>, query: string): boolean {
  const q = strip(query.trim());
  if (!q) return true;
  return haystack.some((h) => (h ? strip(h).includes(q) : false));
}

/** Ionicons glyph for a service (shot → flask, verre → wine, demi/pinte → beer). */
export function servingIcon(name: string, volumeCl?: number): IconName {
  const n = strip(name);
  if (/shot|shooter|dose|mignon/.test(n)) return 'flask-outline';
  if (/demi|pinte|biere|bock|galopin|pression|seau|pichet/.test(n)) return 'beer-outline';
  if (/vin|verre|coupe|flute|champ|ballon/.test(n)) return 'wine-outline';
  if (volumeCl !== undefined) {
    if (volumeCl <= 6) return 'flask-outline';
    if (volumeCl <= 20) return 'wine-outline';
  }
  return 'beer-outline';
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
