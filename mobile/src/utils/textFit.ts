/**
 * Font-size fitting for single-line numbers on web, where react-native-web
 * ignores `adjustsFontSizeToFit`. The width is estimated per character for
 * Plus Jakarta Sans 700/800 with tabular digits (measured in Chromium):
 * digits ≈ 0.58 em, spaces / NBSP / punctuation ≈ 0.3 em, « € » ≈ 0.62 em,
 * « % » ≈ 0.8 em, other letters ≈ 0.6 em.
 *
 *   const size = fitFontSize('99 999 999,00 €', roomPx, 30, 16); // ≤ 30
 */

function charEm(ch: string): number {
  if (ch >= '0' && ch <= '9') return 0.58;
  if (ch === ' ' || ch === ' ' || ch === ' ' || ch === ',' || ch === '.' || ch === ':' || ch === '·') return 0.3;
  if (ch === '€') return 0.62;
  if (ch === '%') return 0.8;
  if (ch === '×' || ch === '+' || ch === '−' || ch === '-') return 0.55;
  return 0.6;
}

/** Estimated width of `text`, in em. */
export function estimateTextEm(text: string): number {
  let em = 0;
  for (const ch of text) em += charEm(ch);
  return em;
}

/**
 * The largest font size ≤ `base` (and ≥ `min`) at which `text` fits in `room`
 * pixels, with a small safety margin. Returns `base` when the room is unknown.
 */
export function fitFontSize(text: string, room: number, base: number, min: number): number {
  if (!text || !(room > 0) || !isFinite(room)) return base;
  const em = estimateTextEm(text) * 1.04;
  if (em * base <= room) return base;
  return Math.max(min, Math.min(base, Math.floor(room / em)));
}
