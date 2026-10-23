/**
 * « Sous l’objectif » (lot 2 n° 7, mockup 2): the pure part. One row per
 * service (or per product sold without services) whose margin is under the
 * user's objective, with the suggested price (utils/pricing, rounded UP to the
 * user's « Arrondi des prix »), the new margin and the gain per dose.
 *
 *   Champagne Moët Brut · Verre de vin 12 cl · +8,08 € par verre
 *   9,00 € 27,5 %  →  18,70 € ✓ 65,1 %                       [Appliquer]
 *   ! +108 % : vérifiez d’abord l’achat (34,00 € HT).   [13,10 € · seuil 50 %]
 *
 * A jump of more than +30 % of the current price is « guarded »: « Tout
 * appliquer » leaves it out, the user applies it alone (or the threshold
 * price), after checking the purchase price.
 */
import { BatchPriceUpdate, calculateServingMargin, ProductWithMargin } from '@margebar/shared';
import { categoryIcon, servingLabel, sortedServings } from '../../../components/ui';
import { servingIconName } from '../../../components/ui/ServingTypeIcon';
import type { IconName } from '../../../components/ui';
import { getMarginZone, MarginThresholds } from '../../../utils/marginThresholds';
import { doseCost, marginAt, suggestedPrice, thresholdPrice } from '../../../utils/pricing';
import { doseLabel, soldWhole } from '../../../utils/servings';
import { serviceNoun } from '../form/pricing';
import { DOSE_KEY } from '../list/PriceEditSheet';

/** A suggested price more than this above the current one asks for a check first. */
export const GUARD_JUMP = 0.3;

export type RowZone = 'red' | 'orange';

export interface TargetRow {
  /** `${productId}:${serviceKey}` */
  key: string;
  productId: string;
  productName: string;
  /** Service type id, or DOSE_KEY for a product sold without services. */
  serviceKey: string;
  /** « Verre de vin 12 cl », « À l’unité », « Dose 25 cl ». */
  label: string;
  /** « verre », « bouteille », « shot »: « +8,08 € par verre ». */
  noun: string;
  icon: IconName;
  /** Current TTC price and margin (%). */
  price: number;
  margin: number;
  zone: RowZone;
  /** HT cost of one dose. */
  cost: number;
  tva: number;
  purchasePriceHT: number;
  /** Suggested TTC price (objective, rounded up) and its margin. */
  suggested: number;
  newMargin: number;
  /** HT gain per dose added by the suggested price. */
  gainDelta: number;
  /** The product's headline service: its margin is the product's margin. */
  primary: boolean;
  /** Set when the suggested price is more than +30 % above the current one. */
  guard: null | {
    /** « +108 » (%). */
    jumpPct: number;
    /** The « seuil » price (medium threshold, rounded up), when it is above the current price. */
    threshold: number | null;
    thresholdMargin: number | null;
  };
}

const cents = (n: number) => Math.round(n * 100) / 100;
const m2 = (n: number) => (isFinite(n) ? Math.round(n * 100) / 100 : n);

function zoneOf(margin: number, t: MarginThresholds): RowZone {
  return getMarginZone(margin, t) === 'red' ? 'red' : 'orange';
}

/** One price line of a product: every service, or its own dose. */
function linesOf(p: ProductWithMargin) {
  const list = sortedServings(p).filter((s) => !!s.servingType);
  if (list.length) {
    return list.map((s, i) => {
      let margin = NaN;
      try {
        margin = calculateServingMargin(p.purchasePriceHT, p.containerVolumeCl, p.tvaRate, s.servingType, s.sellingPriceTTC).marginPercent;
      } catch {
        // A service priced at 0 € cannot be computed: left out.
      }
      return {
        key: s.servingTypeId,
        label: servingLabel(s.servingType.name, s.servingType.volumeCl),
        noun: serviceNoun(s.servingType.name).one,
        // Spirits keep their category's flask (« Verre (spiritueux) » would read as a wine glass).
        icon: p.category?.slug === 'spiritueux' || /spiritueux/i.test(s.servingType.name) ? categoryIcon('spiritueux') : servingIconName(s.servingType.name, s.servingType.volumeCl),
        volumeCl: s.servingType.volumeCl,
        price: s.sellingPriceTTC,
        margin,
        primary: i === 0,
      };
    });
  }
  const whole = soldWhole(p.containerVolumeCl, p.doseVolumeCl);
  return [
    {
      key: DOSE_KEY,
      label: doseLabel(p.containerVolumeCl, p.doseVolumeCl),
      noun: whole ? 'bouteille' : 'dose',
      icon: categoryIcon(p.category?.slug),
      volumeCl: p.doseVolumeCl,
      price: p.computed?.sellingPriceTTC ?? p.sellingPriceTTC ?? 0,
      margin: p.computed?.marginPercent ?? NaN,
      primary: true,
    },
  ];
}

/**
 * Every service under the objective, worst margin first. `onlyIds` restricts
 * to some products (the ones an invoice changed). Products whose margin cannot
 * be suggested (no purchase price, objective ≥ 100 %) are left out.
 */
export function underTargetRows(products: ProductWithMargin[], t: MarginThresholds, rounding: number, onlyIds?: ReadonlySet<string> | null): TargetRow[] {
  const rows: TargetRow[] = [];
  for (const p of products) {
    if (onlyIds && !onlyIds.has(p.id)) continue;
    for (const l of linesOf(p)) {
      if (!isFinite(l.margin) || !(l.price > 0) || l.margin >= t.good) continue;
      const cost = doseCost(p.purchasePriceHT, p.containerVolumeCl, l.volumeCl);
      if (!(cost > 0)) continue;
      const suggested = suggestedPrice(cost, p.tvaRate, t.good, rounding);
      if (suggested === null || suggested <= l.price + 0.004) continue;
      // Rounded to 0,01 like the API's `computed`, so the row and the detail print the same margin.
      const newMargin = m2(marginAt(cost, p.tvaRate, suggested));
      const ht = (n: number) => n / (1 + (p.tvaRate > 0 ? p.tvaRate : 0));
      const jump = suggested / l.price - 1;
      let guard: TargetRow['guard'] = null;
      if (jump > GUARD_JUMP) {
        const seuil = thresholdPrice(cost, p.tvaRate, t.medium, rounding);
        const usable = seuil !== null && seuil > l.price + 0.004 && seuil < suggested - 0.004;
        guard = {
          jumpPct: Math.round(jump * 100),
          threshold: usable ? seuil : null,
          thresholdMargin: usable ? m2(marginAt(cost, p.tvaRate, seuil as number)) : null,
        };
      }
      rows.push({
        key: `${p.id}:${l.key}`,
        productId: p.id,
        productName: p.name,
        serviceKey: l.key,
        label: l.label,
        noun: l.noun,
        icon: l.icon,
        price: l.price,
        margin: l.margin,
        zone: zoneOf(l.margin, t),
        cost,
        tva: p.tvaRate,
        purchasePriceHT: p.purchasePriceHT,
        suggested,
        newMargin,
        gainDelta: cents(ht(suggested) - ht(l.price)),
        primary: l.primary,
        guard,
      });
    }
  }
  return rows.sort((a, b) => a.margin - b.margin || a.productName.localeCompare(b.productName, 'fr'));
}

/**
 * The batch updates that set `prices` (row key → TTC price), one per product:
 * a product with services sends its FULL set (the others unchanged, from the
 * latest copy), a product sold without services its own price.
 */
export function updatesFor(prices: Map<string, { row: TargetRow; price: number }>, products: ProductWithMargin[]): BatchPriceUpdate[] {
  const byProduct = new Map<string, { row: TargetRow; price: number }[]>();
  for (const v of prices.values()) {
    const list = byProduct.get(v.row.productId) ?? [];
    list.push(v);
    byProduct.set(v.row.productId, list);
  }
  const updates: BatchPriceUpdate[] = [];
  for (const [productId, entries] of byProduct) {
    const p = products.find((x) => x.id === productId);
    const dose = entries.find((e) => e.row.serviceKey === DOSE_KEY);
    if (dose || !p || !sortedServings(p).length) {
      updates.push({ productId, sellingPriceTTC: cents((dose ?? entries[0]).price) });
      continue;
    }
    const set = new Map(entries.map((e) => [e.row.serviceKey, cents(e.price)]));
    updates.push({
      productId,
      servings: sortedServings(p).map((s) => ({ servingTypeId: s.servingTypeId, sellingPriceTTC: set.get(s.servingTypeId) ?? s.sellingPriceTTC })),
    });
  }
  return updates;
}

/**
 * Average margin of the catalogue (as « Mes produits » shows it: the products'
 * headline margins), before and after setting `prices`. Only a product's
 * headline service moves its margin.
 */
export function averageAfter(products: ProductWithMargin[], prices: Map<string, { row: TargetRow; price: number }>): { before: number | null; after: number | null } {
  const headline = new Map<string, number>();
  for (const { row, price } of prices.values()) {
    if (row.primary) headline.set(row.productId, m2(marginAt(row.cost, row.tva, price)));
  }
  let sumB = 0;
  let sumA = 0;
  let n = 0;
  for (const p of products) {
    const m = p.computed?.marginPercent;
    if (typeof m !== 'number' || !isFinite(m)) continue;
    sumB += m;
    sumA += headline.get(p.id) ?? m;
    n += 1;
  }
  return n ? { before: sumB / n, after: sumA / n } : { before: null, after: null };
}
