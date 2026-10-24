/**
 * Inline validation of the auth forms (same rules as the backend:
 * e-mail format, password ≥ 8 characters on sign-up), plus the business
 * name on sign-up. Every message is a full French sentence shown under
 * its field; numbers go through utils/format (NBSP before the unit).
 */
import { plural } from '../../../utils/format';

export const PASSWORD_MIN = 8;
export const BUSINESS_NAME_MAX = 80;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

export function emailError(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Saisissez votre adresse e-mail.';
  if (!isValidEmail(v)) return 'Adresse e-mail invalide, par exemple nom@etablissement.fr.';
  return null;
}

export function passwordError(value: string, mode: 'login' | 'register'): string | null {
  if (!value) return mode === 'register' ? 'Choisissez un mot de passe.' : 'Saisissez votre mot de passe.';
  if (mode === 'register' && value.length < PASSWORD_MIN) {
    return `Le mot de passe doit contenir au moins ${plural(PASSWORD_MIN, 'caractère')}.`;
  }
  return null;
}

/** Live helper under the sign-up password (counts down to 8). */
export function passwordHelper(value: string): string {
  if (!value) return `${plural(PASSWORD_MIN, 'caractère')} minimum.`;
  const left = PASSWORD_MIN - value.length;
  if (left > 0) return `Encore ${plural(left, 'caractère')}.`;
  return 'Longueur suffisante.';
}

export function businessNameError(value: string): string | null {
  const v = value.trim();
  if (!v) return 'Indiquez le nom de votre établissement.';
  if (v.length < 2) return 'Le nom de l’établissement est trop court.';
  if (v.length > BUSINESS_NAME_MAX) return `Le nom est trop long (${plural(BUSINESS_NAME_MAX, 'caractère')} maximum).`;
  return null;
}
