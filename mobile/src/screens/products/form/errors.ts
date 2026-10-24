/**
 * Save / delete errors → a readable French message plus the fields to
 * highlight. The backend's `error` is always a readable sentence: it is shown
 * as is, and `details[].field` tells which inputs to outline (RC8).
 */
import type { ApiValidationIssue } from '@margebar/shared';
import { OFFLINE_MESSAGE, OfflineError, isNetworkError, isOnline, isTimeoutError } from '../../../services/offline';

export type FieldKey = 'name' | 'category' | 'container' | 'purchase' | 'degree' | 'supplier' | 'photo' | 'services' | 'tva';
export type FieldErrors = Partial<Record<FieldKey, string>>;

export interface SaveErrorInfo {
  title: string;
  message: string;
  fields: FieldErrors;
  offline: boolean;
}

const FIELD_MAP: Array<[RegExp, FieldKey]> = [
  [/^name$/, 'name'],
  [/^categoryId$|^category$/, 'category'],
  [/^containerVolumeCl$/, 'container'],
  [/^purchasePriceHT$/, 'purchase'],
  [/^alcoholDegree$/, 'degree'],
  [/^supplier$/, 'supplier'],
  [/^imageUrl$|^thumbnailUrl$/, 'photo'],
  [/^tvaRate$/, 'tva'],
  [/^servings|^sellingPriceTTC$|^doseVolumeCl$|^targetMarginPercent$|^coefficient$|^marginMode$/, 'services'],
];

export function fieldOf(path: string | undefined): FieldKey | null {
  if (!path) return null;
  for (const [re, key] of FIELD_MAP) if (re.test(path)) return key;
  return null;
}

export function describeSaveError(err: any, action: 'save' | 'delete' = 'save'): SaveErrorInfo {
  const verb = action === 'save' ? 'enregistré' : 'supprimé';
  if (err instanceof OfflineError || (!err?.response && (!isOnline() || isNetworkError(err)))) {
    const raw = err instanceof OfflineError ? err.message : action === 'save' ? OFFLINE_MESSAGE : `Pas de connexion : le produit n’a pas été ${verb}. Réessayez une fois connecté.`;
    // The title already says « Pas de connexion »: keep only the rest of the sentence.
    const rest = raw.replace(/^Pas de connexion\s*:\s*/i, '');
    return {
      title: 'Pas de connexion',
      message: rest.charAt(0).toUpperCase() + rest.slice(1),
      fields: {},
      offline: true,
    };
  }
  if (!err?.response && isTimeoutError(err)) {
    return {
      title: 'Le serveur ne répond pas',
      message: 'L’opération a pris trop de temps. Vérifiez votre connexion, puis réessayez.',
      fields: {},
      offline: false,
    };
  }
  const status: number | undefined = err?.response?.status;
  const body = err?.response?.data;
  const serverMessage = typeof body?.error === 'string' && body.error.trim() ? body.error.trim() : null;
  const fields: FieldErrors = {};
  const details: ApiValidationIssue[] = Array.isArray(body?.details) ? body.details : [];
  for (const d of details) {
    const key = fieldOf(d?.field);
    if (key && !fields[key]) fields[key] = d.message || d.label || 'Valeur à corriger';
  }
  if (status === 413) fields.photo = fields.photo ?? 'Photo trop volumineuse';

  let message = serverMessage;
  if (!message) {
    if (status === 404) message = 'Ce produit n’existe plus : il a peut-être été supprimé depuis un autre appareil.';
    else if (status === 429) message = 'Trop de demandes d’affilée. Patientez quelques secondes, puis réessayez.';
    else if (status === 401) message = 'Votre session a expiré. Reconnectez-vous pour continuer.';
    else if (status && status >= 500) message = 'Le serveur a rencontré un problème. Réessayez dans un instant.';
    else message = typeof err?.message === 'string' && err.message && !/status code|network/i.test(err.message) ? err.message : `Le produit n’a pas pu être ${verb}.`;
  }
  return {
    title: action === 'save' ? 'Enregistrement impossible' : 'Suppression impossible',
    message,
    fields,
    offline: false,
  };
}
