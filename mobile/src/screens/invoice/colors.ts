/** `#RRGGBB` palette token → `rgba(r,g,b,a)`, for tints derived from the palette (never a hard-coded hex). */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}
