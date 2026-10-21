/**
 * fr-FR number formatting for the whole app.
 * Decimal comma, NBSP (U+00A0) before « € » and « % », « ×3,23 » coefficients.
 *
 *   formatEuro(7.5)              → « 7,50 € »
 *   formatEuro(1932.42)          → « 1 932,42 € »
 *   formatEuro(7, { decimals: 0 }) → « 7 € »
 *   formatEuro(1.96, { sign: true }) → « +1,96 € »
 *   formatPercent(69)            → « 69,0 % »
 *   formatCoeff(3.2345)          → « ×3,23 »
 *   formatNumber(1234.5, 1)      → « 1 234,5 »
 *   formatVolumeCl(70)           → « 70 cl »   formatVolumeCl(150) → « 1,5 L »
 *   formatDegree(40)             → « 40 % vol. »
 *   parseLocaleFloat('1 234,50') → 1234.5
 *
 * Group separators are NBSP too (Intl uses U+202F which Jakarta lacks).
 */

export const NBSP = ' ';
const NNBSP = ' ';

type NumberFormatCache = Record<string, Intl.NumberFormat>;
const cache: NumberFormatCache = {};

function nf(min: number, max: number, grouping = true): Intl.NumberFormat | null {
  const key = `${min}-${max}-${grouping ? 1 : 0}`;
  if (cache[key]) return cache[key];
  try {
    cache[key] = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
      useGrouping: grouping,
    });
    return cache[key];
  } catch {
    return null;
  }
}

/** Fallback when Intl is unavailable (old Hermes builds). */
function manual(value: number, min: number, max: number, grouping: boolean): string {
  const fixed = value.toFixed(max);
  let [int, dec = ''] = fixed.split('.');
  // trim trailing zeros beyond `min`
  while (dec.length > min && dec.endsWith('0')) dec = dec.slice(0, -1);
  const neg = int.startsWith('-');
  if (neg) int = int.slice(1);
  if (grouping) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${neg ? '-' : ''}${int}${dec ? `,${dec}` : ''}`;
}

/**
 * Format a number in fr-FR with `digits` decimals (min = max unless `minDigits`).
 * Non-finite values render as « – ».
 */
export function formatNumber(
  value: number | null | undefined,
  digits = 0,
  opts: { minDigits?: number; grouping?: boolean; sign?: boolean } = {},
): string {
  if (value === null || value === undefined || !isFinite(value)) return '–';
  const min = opts.minDigits ?? digits;
  const grouping = opts.grouping ?? true;
  // Avoid « -0,00 »
  const rounded = Math.abs(value) < 0.5 * Math.pow(10, -digits) ? 0 : value;
  const f = nf(min, digits, grouping);
  let out = f ? f.format(rounded) : manual(rounded, min, digits, grouping);
  out = out.replace(new RegExp(NNBSP, 'g'), NBSP).replace(/−/g, '-');
  if (opts.sign && rounded > 0) out = `+${out}`;
  return out;
}

export interface EuroOptions {
  /** Fraction digits (default 2). */
  decimals?: number;
  /** Drop « ,00 » for whole amounts (« 7 € »). */
  trimZeros?: boolean;
  /** Prefix positive values with « + ». */
  sign?: boolean;
  /** Append nothing (just the number, e.g. inside a field with a « € » suffix). */
  bare?: boolean;
}

/** « 7,50 € » */
export function formatEuro(value: number | null | undefined, opts: EuroOptions = {}): string {
  if (value === null || value === undefined || !isFinite(value)) return opts.bare ? '–' : `–${NBSP}€`;
  const decimals = opts.decimals ?? 2;
  const whole = Math.abs(value - Math.round(value)) < 0.005;
  const n = formatNumber(value, decimals, { minDigits: opts.trimZeros && whole ? 0 : decimals, sign: opts.sign });
  return opts.bare ? n : `${n}${NBSP}€`;
}

/** « 69,0 % » (value is already a percentage: 69 → « 69,0 % »). */
export function formatPercent(value: number | null | undefined, digits = 1, opts: { sign?: boolean } = {}): string {
  if (value === null || value === undefined || !isFinite(value)) return `–${NBSP}%`;
  return `${formatNumber(value, digits, { sign: opts.sign })}${NBSP}%`;
}

/** « +7,5 pts » — difference of percentages. */
export function formatPoints(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !isFinite(value)) return '–';
  return `${formatNumber(value, digits, { sign: true })}${NBSP}pts`;
}

/** « ×3,23 » */
export function formatCoeff(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !isFinite(value) || value <= 0) return '×–';
  return `×${formatNumber(value, digits)}`;
}

/** « 70 cl », « 1,5 L », « 30 L » */
export function formatVolumeCl(cl: number | null | undefined): string {
  if (cl === null || cl === undefined || !isFinite(cl)) return `–${NBSP}cl`;
  if (cl >= 100) {
    const l = cl / 100;
    return `${formatNumber(l, Number.isInteger(l) ? 0 : l * 10 === Math.round(l * 10) ? 1 : 2)}${NBSP}L`;
  }
  return `${formatNumber(cl, Number.isInteger(cl) ? 0 : 1)}${NBSP}cl`;
}

/** « 40 % vol. », « 12,5 % vol. » */
export function formatDegree(value: number | null | undefined): string {
  if (value === null || value === undefined || !isFinite(value)) return `–${NBSP}%${NBSP}vol.`;
  const digits = Number.isInteger(value) ? 0 : 1;
  return `${formatNumber(value, digits)}${NBSP}%${NBSP}vol.`;
}

/** « 1 932,42 €/hl AP » style rates. */
export function formatRate(value: number | null | undefined, unit: string): string {
  return `${formatEuro(value)}/${unit}`;
}

/** Plural helper: plural(2, 'service') → « 2 services ». */
export function plural(count: number, singular: string, pluralForm?: string): string {
  const word = Math.abs(count) >= 2 ? pluralForm ?? `${singular}s` : singular;
  return `${formatNumber(count, 0)}${NBSP}${word}`;
}

/**
 * Parse user input in French or English notation.
 * Accepts « , » or « . » as decimal separator, spaces/NBSP as group
 * separators, a trailing « € », « % » or « ×». Returns NaN when empty/invalid.
 */
export function parseLocaleFloat(input: string | number | null | undefined): number {
  if (typeof input === 'number') return input;
  if (input === null || input === undefined) return NaN;
  let s = String(input).trim();
  if (!s) return NaN;
  s = s.replace(/[\s  ]/g, '').replace(/[€%×xX]/g, '').replace(/vol\.?/gi, '');
  // « 1.234,50 » → « 1234.50 »; « 1,234.50 » → « 1234.50 »
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = s.replace(/,/g, (m, i) => (i === lastComma ? '.' : ''));
  }
  if (!/^[-+]?\d*\.?\d*$/.test(s) || s === '' || s === '.' || s === '-' || s === '+') return NaN;
  const n = parseFloat(s);
  return isFinite(n) ? n : NaN;
}

/** Format a number for an editable field (no grouping, comma decimal): 7.5 → « 7,50 ». */
export function toInputString(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !isFinite(value)) return '';
  return formatNumber(value, digits, { grouping: false });
}

/** Round to a step (avoids 0.30000000000000004). */
export function roundToStep(value: number, step: number): number {
  if (!step) return value;
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)) + 1);
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
