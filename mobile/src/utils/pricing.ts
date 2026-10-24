/**
 * Suggested selling prices (lot 1 n° 1): the one place that turns a cost and
 * an objective into prices a bar can print on its menu.
 *
 *   objectivePrice(2.79, 0.2, 65)               → 9,57 €  (lowest price, to the cent, reaching 65 %)
 *   suggestedPrice(2.79, 0.2, 65, 0.1)          → 9,60 €  (rounded UP: never under the objective)
 *   thresholdPrice(2.79, 0.2, 50, 0.1)          → 6,70 €  (« seuil » : the medium threshold, rounded up)
 *   priceSuggestions(2.79, 0.2, 65, 0.1)        → [9,60 € objectif · 10,00 € · 10,50 €]
 *   marginAt(2.79, 0.2, 9.6)                    → 65,1
 *
 * Prices are TTC, costs are the HT cost of one dose (purchase price × dose ÷
 * container), `tva` is a rate (0.2). Every rounding goes UP, so the margin of
 * a suggested price is always at least the objective.
 */
import { DEFAULT_PRICE_ROUNDING } from './priceRounding';

/** Prices are compared and stored to the cent. */
const cents = (n: number) => Math.round(n * 100) / 100;

/** HT cost of one dose. 0 when it cannot be known. */
export function doseCost(purchaseHT: number, containerCl: number, doseCl: number): number {
  if (!(containerCl > 0) || !(doseCl > 0) || !(purchaseHT >= 0)) return 0;
  return (purchaseHT * doseCl) / containerCl;
}

/** Margin (in %, on the HT price) of a TTC price. NaN when the price is not positive. */
export function marginAt(costHT: number, tva: number, priceTTC: number): number {
  const ht = priceTTC / (1 + (tva > 0 ? tva : 0));
  if (!(ht > 0) || !isFinite(ht)) return NaN;
  return ((ht - costHT) / ht) * 100;
}

/**
 * Lowest TTC price, to the cent, whose margin reaches `marginPct`. Null when
 * the dose costs nothing (every price is 100 %) or the objective is not
 * reachable (≥ 100 %).
 */
export function objectivePrice(costHT: number, tva: number, marginPct: number): number | null {
  if (!(costHT > 0) || !(marginPct < 100) || !isFinite(marginPct)) return null;
  const p = (costHT / (1 - Math.max(marginPct, 0) / 100)) * (1 + (tva > 0 ? tva : 0));
  return Math.ceil(p * 100 - 1e-6) / 100;
}

/** Rounds a price UP to the next multiple of `step` (a price already on the step stays). */
export function roundUpToStep(price: number, step: number): number {
  if (!(step > 0)) return cents(price);
  // Work in cents so 13,10 / 0,10 never becomes 131,00000001 steps.
  const c = Math.round(price * 100);
  const s = Math.round(step * 100);
  return (Math.ceil(c / s) * s) / 100;
}

/**
 * The suggested price for an objective: the objective price rounded UP to the
 * user's « Arrondi des prix » step (0,05 · 0,10 · 0,50 €), so the margin never
 * drops below the objective. Null when there is nothing to suggest.
 */
export function suggestedPrice(costHT: number, tva: number, objectivePct: number, rounding: number = DEFAULT_PRICE_ROUNDING): number | null {
  const p = objectivePrice(costHT, tva, objectivePct);
  return p === null ? null : roundUpToStep(p, rounding);
}

/** The « seuil » price: the medium threshold (« à revoir » below it), rounded up the same way. */
export function thresholdPrice(costHT: number, tva: number, mediumPct: number, rounding: number = DEFAULT_PRICE_ROUNDING): number | null {
  return suggestedPrice(costHT, tva, mediumPct, rounding);
}

/**
 * Step between the « round » prices offered after the objective one: 0,50 €
 * under 20 €, 1 € under 50 €, then 5 € and 10 €. Never finer than the
 * user's rounding.
 */
export function roundStepFor(price: number, rounding: number = DEFAULT_PRICE_ROUNDING): number {
  const step = price < 20 ? 0.5 : price < 50 ? 1 : price < 200 ? 5 : 10;
  return Math.max(step, rounding);
}

export interface PriceSuggestion {
  /** TTC price. */
  price: number;
  /** Its margin, in %. */
  margin: number;
  /** The objective price (first chip) or a round price above it. */
  kind: 'objective' | 'round';
}

/**
 * What the « Prix conseillés » chips offer: the objective price (rounded up to
 * the user's step), then the next `count - 1` round prices above it
 * (« 13,10 € · objectif 65 % », « 13,50 € », « 14,00 € »). Empty when no
 * price can be suggested (no purchase price, objective ≥ 100 %).
 */
export function priceSuggestions(
  costHT: number,
  tva: number,
  objectivePct: number,
  rounding: number = DEFAULT_PRICE_ROUNDING,
  count = 3,
): PriceSuggestion[] {
  const first = suggestedPrice(costHT, tva, objectivePct, rounding);
  if (first === null || !isFinite(first)) return [];
  const out: PriceSuggestion[] = [{ price: first, margin: marginAt(costHT, tva, first), kind: 'objective' }];
  const step = roundStepFor(first, rounding);
  let next = roundUpToStep(first, step);
  // Strictly above the objective price: 13,50 € is not offered twice when the objective is 13,50 €.
  if (next <= first + 0.004) next = cents(next + step);
  while (out.length < count) {
    out.push({ price: next, margin: marginAt(costHT, tva, next), kind: 'round' });
    next = cents(next + roundStepFor(next, rounding));
  }
  return out;
}

/** True when two TTC prices are the same to the cent. */
export function samePrice(a: number | null | undefined, b: number | null | undefined): boolean {
  return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.005;
}
