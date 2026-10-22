/**
 * Text-width estimate for Plus Jakarta Sans numbers, so large values can be
 * scaled to fit on web (react-native-web ignores `adjustsFontSizeToFit`).
 * Advance widths in em, measured in Chromium with `tabular-nums` (every digit
 * is 0.6 em in each weight); letters fall back to a slightly generous
 * 0.55 em (lower-case Medium text averages 0.48–0.5 em).
 */
const EM: Record<string, number> = {
  ',': 0.39,
  '.': 0.36,
  ' ': 0.18,
  ' ': 0.09,
  ' ': 0.18,
  '€': 0.77,
  '%': 1.07,
  '-': 0.64,
  '−': 0.64,
  '+': 0.64,
  '×': 0.6,
  '’': 0.22,
  '·': 0.26,
  '/': 0.42,
  '>': 0.6,
  '<': 0.6,
};

/** Estimated rendered width (px) of `text` at `fontSize` with `letterSpacing`. */
export function estimateTextWidth(text: string, fontSize: number, letterSpacing = 0): number {
  let em = 0;
  for (const ch of text) em += /[0-9]/.test(ch) ? 0.6 : EM[ch] ?? 0.55;
  return em * fontSize + letterSpacing * text.length;
}

/**
 * The font scale (≤ 1) that makes the given runs fit in `available` px.
 * Each run is [text, fontSize, letterSpacing]; all scale together.
 */
export function fitScale(runs: Array<[string, number, number?]>, available: number, minScale = 0.5): number {
  if (!(available > 0)) return 1;
  const width = runs.reduce((sum, [t, size, ls = 0]) => sum + estimateTextWidth(t, size, ls), 0);
  if (width <= available) return 1;
  return Math.max(minScale, available / width);
}
