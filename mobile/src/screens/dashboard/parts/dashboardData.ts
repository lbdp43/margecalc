/**
 * Pure helpers for the Tableau de bord: averages, per-category stats, top &
 * flop, greeting. No React here so they stay cheap to memoise and easy to test.
 */
import type { ProductWithMargin } from '@margebar/shared';

export interface CategoryStat {
  key: string;
  name: string;
  count: number;
  /** Average margin in % (0–100). */
  avg: number;
}

function marginOf(p: ProductWithMargin): number | null {
  const m = p.computed?.marginPercent;
  return typeof m === 'number' && isFinite(m) ? m : null;
}

/** Products that carry a computed margin (the API always sends one; be defensive). */
export function withMargin(products: ProductWithMargin[]): ProductWithMargin[] {
  return products.filter((p) => marginOf(p) !== null);
}

/** Simple mean of the products' margins, or null when there is none. */
export function averageMargin(products: ProductWithMargin[]): number | null {
  let sum = 0;
  let n = 0;
  for (const p of products) {
    const m = marginOf(p);
    if (m === null) continue;
    sum += m;
    n += 1;
  }
  return n > 0 ? sum / n : null;
}

/** Average margin per category, best first (ties: more products first). */
export function categoryStats(products: ProductWithMargin[]): CategoryStat[] {
  const map = new Map<string, { name: string; sum: number; count: number }>();
  for (const p of products) {
    const m = marginOf(p);
    if (m === null) continue;
    const key = p.category?.id ?? p.categoryId ?? 'autre';
    const name = p.category?.name ?? 'Autre';
    const entry = map.get(key) ?? { name, sum: 0, count: 0 };
    entry.sum += m;
    entry.count += 1;
    map.set(key, entry);
  }
  return Array.from(map.entries())
    .map(([key, e]) => ({ key, name: e.name, count: e.count, avg: e.sum / e.count }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count);
}

/** Best `n` margins (descending) and worst `n` (ascending). */
export function topFlop(products: ProductWithMargin[], n = 5): { top: ProductWithMargin[]; flop: ProductWithMargin[] } {
  const sorted = withMargin(products).sort((a, b) => (marginOf(b) as number) - (marginOf(a) as number));
  return {
    top: sorted.slice(0, n),
    flop: sorted.slice(-n).reverse(),
  };
}

/** « Bonjour, » until 18 h, « Bonsoir, » in the evening and at night. */
export function greeting(date: Date = new Date()): string {
  const h = date.getHours();
  return h >= 18 || h < 5 ? 'Bonsoir,' : 'Bonjour,';
}

/** A formatted value read aloud: « 72,5 % » → « 72,5 pour cent », « 7,15 € » → « 7,15 euros ». */
export function spoken(text: string): string {
  return text
    .replace(/ /g, ' ')
    .replace(/%/g, 'pour cent')
    .replace(/€/g, 'euros')
    .replace(/×/g, 'coefficient ');
}

/** The readable French message of an API / network error. */
export function errorMessage(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { error?: unknown } }; message?: string } | null | undefined;
  const apiError = e?.response?.data?.error;
  if (typeof apiError === 'string' && apiError.trim()) return apiError;
  if (e && !e.response && e.message && /network|timeout|fetch/i.test(e.message)) {
    return 'Connexion impossible. Vérifiez votre réseau, puis réessayez.';
  }
  return fallback;
}
