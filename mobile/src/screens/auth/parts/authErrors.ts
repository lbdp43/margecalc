/**
 * Turns an auth API failure into something readable: the backend's `error`
 * sentence as is (contract), the fields to highlight (from `details`), and a
 * title for the banner when the case deserves one (suspended account, too many
 * attempts, no connection…).
 */
import { isNetworkError, isOnline, isTimeoutError } from '../../../services/offline';

export type AuthField = 'email' | 'password' | 'businessName';

export type AuthErrorKind =
  | 'offline'
  | 'timeout'
  | 'credentials'
  | 'banned'
  | 'conflict'
  | 'rate'
  | 'validation'
  | 'server';

export interface AuthErrorInfo {
  kind: AuthErrorKind;
  title?: string;
  /** Sentence for the banner (empty when the fields carry everything). */
  message: string;
  fields: Partial<Record<AuthField, string>>;
}

const FIELDS: AuthField[] = ['email', 'password', 'businessName'];

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** French typography for a backend sentence: « d'informations » → « d’informations ». */
export function frenchQuotes(message: string): string {
  return message.replace(/([A-Za-zÀ-ÿ])'([A-Za-zÀ-ÿ])/g, '$1’$2');
}

/**
 * Same words as the form, same punctuation as the local messages: the backend
 * says « Email ou mot de passe incorrect » / « …avec cet email », the labels say
 * « Adresse e-mail ». The meaning is never changed.
 */
export function authTypography(message: string): string {
  let m = frenchQuotes(message.trim());
  if (!m) return m;
  m = m.replace(/\bcet e-?mail\b/gi, 'cette adresse e-mail').replace(/\b([Ee])-?mail\b/g, '$1-mail');
  if (!/[.!?…»)]$/.test(m)) m += '.';
  return m;
}

/**
 * Drops the start of `message` when it repeats `title` (« Compte suspendu : ce compte… »
 * under the title « Compte suspendu » → « Ce compte… »). Returns the message unchanged otherwise.
 */
export function withoutTitleLead(title: string | undefined, message: string): string {
  if (!title || !message) return message;
  if (!fold(message).startsWith(fold(title))) return message;
  const rest = message.slice(title.length).replace(/^[\s ]*[,:;.–-]?[\s ]*/, '');
  if (!rest) return message;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

export function readAuthError(err: unknown, fallback: string): AuthErrorInfo {
  const e = err as { response?: { status?: number; data?: any }; message?: string; code?: string };
  if (!e?.response) {
    if (isTimeoutError(e)) {
      return {
        kind: 'timeout',
        title: 'Le serveur ne répond pas',
        message: 'La demande a pris trop de temps. Vérifiez votre connexion puis réessayez.',
        fields: {},
      };
    }
    if (!isOnline() || isNetworkError(e)) {
      return {
        kind: 'offline',
        title: 'Pas de connexion internet',
        message: 'Vérifiez votre réseau (Wi-Fi ou données mobiles) puis réessayez.',
        fields: {},
      };
    }
    return { kind: 'server', message: fallback, fields: {} };
  }

  const status = e.response.status ?? 0;
  const data = e.response.data ?? {};
  const backend = typeof data.error === 'string' && data.error.trim() ? authTypography(data.error) : '';
  const fields: Partial<Record<AuthField, string>> = {};
  if (Array.isArray(data.details)) {
    for (const d of data.details) {
      const f = typeof d?.field === 'string' ? (d.field.split('.')[0] as AuthField) : null;
      if (f && FIELDS.includes(f) && typeof d.message === 'string' && !fields[f]) fields[f] = d.message;
    }
  }

  if (status === 400) {
    const mapped = Object.keys(fields).length > 0;
    return { kind: 'validation', message: mapped ? '' : backend || fallback, fields };
  }
  if (status === 401) {
    if (data.code === 'banned') {
      return { kind: 'banned', title: 'Compte suspendu', message: withoutTitleLead('Compte suspendu', backend), fields: {} };
    }
    return { kind: 'credentials', message: backend || 'E-mail ou mot de passe incorrect.', fields: {} };
  }
  if (status === 403) {
    // Login of a banned account.
    return { kind: 'banned', title: 'Compte suspendu', message: withoutTitleLead('Compte suspendu', backend) || 'Ce compte a été suspendu.', fields: {} };
  }
  if (status === 409) {
    return { kind: 'conflict', message: '', fields: { email: backend || 'Un compte existe déjà avec cette adresse e-mail.' } };
  }
  if (status === 429) {
    const title = 'Trop de tentatives';
    return { kind: 'rate', title, message: withoutTitleLead(title, backend) || 'Réessayez dans quelques minutes.', fields: {} };
  }
  // 5xx: a bare « Erreur serveur » says less than the screen's own sentence.
  const generic = !backend || /^erreur (interne|serveur)/i.test(backend);
  return { kind: 'server', message: generic ? `${fallback} Réessayez dans un instant.` : backend, fields: {} };
}
