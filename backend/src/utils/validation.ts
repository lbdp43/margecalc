import { Response } from 'express';
import { z, ZodError, ZodErrorMap, ZodIssue, ZodIssueCode } from 'zod';
import type { ApiValidationIssue } from '@margebar/shared';

/**
 * Readable French validation errors.
 *
 * Every Zod failure becomes:
 *   400 { error: '<phrase française qui nomme le(s) champ(s)>', details: ApiValidationIssue[] }
 * The mobile app shows `error` as is, so it must never contain raw JSON.
 */

/** French labels of the API fields (last path segment wins, e.g. servings.0.sellingPriceTTC). */
const FIELD_LABELS: Record<string, string> = {
  // products
  name: 'Nom',
  categoryId: 'Catégorie',
  category: 'Catégorie',
  purchasePriceHT: 'Prix d’achat HT',
  containerVolumeCl: 'Contenance',
  doseVolumeCl: 'Dose servie',
  marginMode: 'Mode de calcul',
  sellingPriceTTC: 'Prix de vente TTC',
  targetMarginPercent: 'Marge cible',
  coefficient: 'Coefficient',
  tvaRate: 'Taux de TVA',
  alcoholDegree: 'Degré d’alcool',
  supplier: 'Fournisseur',
  imageUrl: 'Photo',
  thumbnailUrl: 'Miniature de la photo',
  quantity: 'Quantité',
  lines: 'Lignes',
  // servings
  servings: 'Services',
  servingTypeId: 'Service',
  volumeCl: 'Volume',
  icon: 'Icône',
  sortOrder: 'Ordre',
  // auth / user
  email: 'E-mail',
  password: 'Mot de passe',
  businessName: 'Nom de l’établissement',
  isAutoEntrepreneur: 'Auto-entrepreneur',
  defaultTvaRate: 'TVA par défaut',
  defaultContainerVolumeCl: 'Contenant par défaut',
  // recipes
  description: 'Description',
  ingredients: 'Ingrédients',
  consumables: 'Consommables',
  productId: 'Produit',
  quantityCl: 'Quantité (cl)',
  costPerUnit: 'Coût',
  unitCost: 'Coût unitaire',
  isPublic: 'Recette publique',
  // scan / rates
  imageBase64: 'Image',
  acciseRate: 'Taux d’accise',
  cotisationRate: 'Cotisation sécurité sociale',
  value: 'Valeur',
};

export function fieldLabel(path: (string | number)[]): string {
  for (let i = path.length - 1; i >= 0; i--) {
    const seg = path[i];
    if (typeof seg === 'string' && FIELD_LABELS[seg]) {
      // "servings.1.sellingPriceTTC" -> "Prix de vente TTC (service n° 2)"
      const idx = path[i - 1];
      const parent = path[i - 2];
      if (typeof idx === 'number' && typeof parent === 'string') {
        const parentLabel = parent === 'servings' ? 'service' : parent === 'lines' ? 'ligne' : parent === 'ingredients' ? 'ingrédient' : 'élément';
        return `${FIELD_LABELS[seg]} (${parentLabel} n° ${idx + 1})`;
      }
      return FIELD_LABELS[seg];
    }
  }
  const last = path[path.length - 1];
  return last === undefined ? 'Données' : String(last);
}

const fmtNum = (n: number | bigint) => String(n).replace('.', ',');

function typeName(t: string): string {
  switch (t) {
    case 'number': case 'integer': case 'float': return 'un nombre';
    case 'string': return 'un texte';
    case 'boolean': return 'oui/non';
    case 'array': return 'une liste';
    case 'object': return 'un objet';
    case 'date': return 'une date';
    default: return t;
  }
}

/** Message for one issue, WITHOUT the field label (the formatter adds it). */
const frenchErrorMap: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === 'undefined' || issue.received === 'null') return { message: 'est obligatoire' };
      if (issue.expected === 'number' && issue.received === 'nan') return { message: 'doit être un nombre' };
      return { message: `doit être ${typeName(issue.expected)}` };
    case ZodIssueCode.too_small:
      if (issue.type === 'string') {
        return { message: Number(issue.minimum) <= 1 ? 'est obligatoire' : `doit contenir au moins ${issue.minimum} caractères` };
      }
      if (issue.type === 'array') {
        return { message: Number(issue.minimum) <= 1 ? 'doit contenir au moins un élément' : `doit contenir au moins ${issue.minimum} éléments` };
      }
      if (issue.type === 'number' || issue.type === 'bigint') {
        if (!issue.inclusive && Number(issue.minimum) === 0) return { message: 'doit être supérieur à 0' };
        return { message: issue.inclusive ? `doit être au moins ${fmtNum(issue.minimum)}` : `doit être supérieur à ${fmtNum(issue.minimum)}` };
      }
      return { message: 'est trop petit' };
    case ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `est trop long (${fmtNum(issue.maximum)} caractères maximum)` };
      if (issue.type === 'array') return { message: `contient trop d’éléments (${fmtNum(issue.maximum)} maximum)` };
      if (issue.type === 'number' || issue.type === 'bigint') {
        return { message: issue.inclusive ? `doit être au plus ${fmtNum(issue.maximum)}` : `doit être inférieur à ${fmtNum(issue.maximum)}` };
      }
      return { message: 'est trop grand' };
    case ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return { message: 'n’est pas une adresse e-mail valide' };
      if (issue.validation === 'uuid') return { message: 'est invalide (choisissez une valeur dans la liste)' };
      if (issue.validation === 'url') return { message: 'n’est pas une adresse valide' };
      return { message: 'a un format invalide' };
    case ZodIssueCode.invalid_enum_value:
      return { message: 'a une valeur non reconnue' };
    case ZodIssueCode.invalid_literal:
    case ZodIssueCode.invalid_union:
    case ZodIssueCode.invalid_union_discriminator:
      return { message: 'a une valeur invalide' };
    case ZodIssueCode.not_finite:
      return { message: 'doit être un nombre fini' };
    case ZodIssueCode.not_multiple_of:
      return { message: `doit être un multiple de ${fmtNum(issue.multipleOf)}` };
    case ZodIssueCode.unrecognized_keys:
      return { message: 'contient des champs inconnus' };
    default:
      return { message: ctx.defaultError };
  }
};

let installed = false;
/** Install the French messages for every schema of the process (idempotent). */
export function installFrenchZodErrors(): void {
  if (installed) return;
  z.setErrorMap(frenchErrorMap);
  installed = true;
}
installFrenchZodErrors();

/** True when the message is already a full sentence that names its subject (custom schema messages). */
function isSentence(message: string): boolean {
  return /^[A-ZÀ-ÖÉÈÊ]/.test(message);
}

export function toIssues(err: ZodError): ApiValidationIssue[] {
  const seen = new Set<string>();
  const out: ApiValidationIssue[] = [];
  for (const issue of err.issues as ZodIssue[]) {
    const field = issue.path.join('.');
    const key = `${field}|${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = fieldLabel(issue.path);
    const message = isSentence(issue.message) ? issue.message : `« ${label} » ${issue.message}.`;
    out.push({ field, label, message: message.endsWith('.') ? message : `${message}.`, code: issue.code });
  }
  return out;
}

/** One readable French sentence for the whole error. */
export function formatZodError(err: ZodError): string {
  const issues = toIssues(err);
  if (!issues.length) return 'Données invalides.';
  if (issues.length === 1) return issues[0].message;
  const shown = issues.slice(0, 4).map((i) => i.message.replace(/\.$/, ''));
  const more = issues.length > 4 ? ` (et ${issues.length - 4} autre${issues.length - 4 > 1 ? 's' : ''})` : '';
  return `${issues.length} champs à corriger : ${shown.join(' ; ')}${more}.`;
}

export function validationErrorBody(err: ZodError) {
  return { error: formatZodError(err), details: toIssues(err) };
}

export function isZodError(err: unknown): err is ZodError {
  return err instanceof ZodError || (!!err && typeof err === 'object' && (err as any).name === 'ZodError' && Array.isArray((err as any).issues));
}

/** Error with an HTTP status and a French message safe to show to the user. */
export class HttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly extra: Record<string, unknown> = {}) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Send a 400 with readable French text if `err` is a validation error (Zod or HttpError).
 * Returns true when a response was sent.
 */
export function sendKnownError(res: Response, err: unknown): boolean {
  if (isZodError(err)) {
    res.status(400).json(validationErrorBody(err));
    return true;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...err.extra });
    return true;
  }
  return false;
}
