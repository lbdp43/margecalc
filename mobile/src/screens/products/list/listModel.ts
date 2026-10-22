/**
 * Pure helpers for « Mes produits »: search, category chips, sort, averages.
 * No React here, so the list screen stays a thin view.
 */
import type { ProductWithMargin } from '@margebar/shared';
import type { ChipItem } from '../../../components/ui';

export type SortKey = 'recent' | 'marginDesc' | 'marginAsc' | 'name';

export const SORT_OPTIONS: { key: SortKey; label: string; hint: string; icon: 'time-outline' | 'trending-down' | 'trending-up' | 'text-outline' }[] = [
  { key: 'recent', label: 'Récemment modifiés', hint: 'Les derniers produits ajoutés ou modifiés en premier', icon: 'time-outline' },
  { key: 'marginAsc', label: 'Marge la plus faible', hint: 'Les produits à revoir en premier', icon: 'trending-down' },
  { key: 'marginDesc', label: 'Marge la plus forte', hint: 'Les produits les plus rentables en premier', icon: 'trending-up' },
  { key: 'name', label: 'Nom (A → Z)', hint: 'Ordre alphabétique', icon: 'text-outline' },
];

export const ALL_KEY = 'all';

/** Lower-case, accents removed, apostrophes unified (« Hendrick’s » = « hendricks »). */
export function normalize(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`´]/g, '')
    .toLowerCase()
    .trim();
}

/** Every word of the query must appear in the name, supplier or category. */
export function matchesQuery(p: ProductWithMargin, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  const hay = normalize(`${p.name} ${p.supplier ?? ''} ${p.category?.name ?? ''}`);
  return q.split(/\s+/).every((w) => hay.includes(w));
}

/** « Tous » + the categories that have products (by category order), with counts. */
export function categoryChips(products: ProductWithMargin[]): ChipItem[] {
  const map = new Map<string, { label: string; slug?: string; order: number; count: number }>();
  for (const p of products) {
    const id = p.categoryId;
    const cur = map.get(id);
    if (cur) cur.count += 1;
    else map.set(id, { label: p.category?.name ?? 'Autre', slug: p.category?.slug, order: p.category?.sortOrder ?? 999, count: 1 });
  }
  const items: ChipItem[] = [...map.entries()]
    .sort((a, b) => a[1].order - b[1].order || a[1].label.localeCompare(b[1].label, 'fr'))
    .map(([key, c]) => ({
      key,
      label: c.label,
      count: c.count,
      accessibilityLabel: `${c.label}, ${c.count} produit${c.count > 1 ? 's' : ''}`,
    }));
  return [{ key: ALL_KEY, label: 'Tous', count: products.length, accessibilityLabel: `Tous les produits, ${products.length}` }, ...items];
}

const time = (s: string) => {
  const t = Date.parse(s);
  return isNaN(t) ? 0 : t;
};

export function sortProducts(list: ProductWithMargin[], key: SortKey): ProductWithMargin[] {
  const out = [...list];
  const m = (p: ProductWithMargin) => p.computed?.marginPercent ?? 0;
  switch (key) {
    case 'marginAsc':
      return out.sort((a, b) => m(a) - m(b) || a.name.localeCompare(b.name, 'fr'));
    case 'marginDesc':
      return out.sort((a, b) => m(b) - m(a) || a.name.localeCompare(b.name, 'fr'));
    case 'name':
      return out.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
    case 'recent':
    default:
      return out.sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
  }
}

/** Mean of `computed.marginPercent` (null when there is nothing to average). */
export function averageMargin(products: ProductWithMargin[]): number | null {
  const values = products.map((p) => p.computed?.marginPercent).filter((v): v is number => typeof v === 'number' && isFinite(v));
  if (!values.length) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}
