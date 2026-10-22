/**
 * Pure pricing helpers for the product form (no React).
 *
 * A service is always stored as its TTC price; the Prix / Marge / Coeff modes
 * are views on that price. In Marge or Coeff mode the value the user set is
 * kept (`modeValue`) so « 65 % » stays « 65 % » instead of drifting through
 * cent rounding, and the price follows it when the purchase price changes.
 */
import { calculateServingMargin, ServingMarginResult } from '@margebar/shared';
import type { SliderZone } from '../../../components/ui';
import type { MarginThresholds } from '../../../utils/marginThresholds';
import { NBSP, formatCoeff, formatEuro, formatNumber, formatPercent, formatVolumeCl } from '../../../utils/format';
import type { PriceMode } from '../../../services/draft.service';

export type { PriceMode };

/** Key of the « Autre dose » pseudo-service (a product sold without service types). */
export const CUSTOM_DOSE = '__dose';

export interface ServiceState {
  /** TTC price — the only value sent to the API. */
  price: number;
  /** False while the price is still our suggestion (it then follows the purchase price). */
  touched: boolean;
  mode: PriceMode;
  /** Last value typed or slid in Marge (%) or Coeff (×) mode; null in Prix mode. */
  modeValue: number | null;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function costPerDoseHT(purchaseHT: number, containerCl: number, doseCl: number): number {
  if (!(containerCl > 0) || !(doseCl > 0) || !(purchaseHT >= 0)) return 0;
  return (purchaseHT * doseCl) / containerCl;
}

/** TTC price for a value expressed in `mode`. */
export function priceFromMode(mode: PriceMode, value: number, costHT: number, tva: number): number {
  switch (mode) {
    case 'price':
      return value;
    case 'margin': {
      if (!(costHT > 0)) return 0;
      const m = Math.min(Math.max(value, 0), 99.9) / 100;
      return (costHT / (1 - m)) * (1 + tva);
    }
    case 'coeff':
      return costHT * Math.max(value, 0) * (1 + tva);
  }
}

/** Value of a TTC price expressed in `mode`. */
export function modeValueFromPrice(mode: PriceMode, price: number, costHT: number, tva: number): number {
  const ht = price / (1 + tva);
  switch (mode) {
    case 'price':
      return price;
    case 'margin':
      return ht > 0 ? ((ht - costHT) / ht) * 100 : 0;
    case 'coeff':
      return costHT > 0 ? ht / costHT : 0;
  }
}

/** Lowest price (to the cent) that reaches `marginPct`. */
export function priceForMargin(costHT: number, tva: number, marginPct: number): number {
  if (!(costHT > 0)) return 0;
  const p = (costHT / (1 - Math.min(marginPct, 99.9) / 100)) * (1 + tva);
  return Math.ceil(p * 100 - 1e-6) / 100;
}

/**
 * Suggested price when a service is switched on (RC2: never 0): a bar-like
 * price a little above the objective, rounded up to 0,10 € (under 5 €) or
 * 0,50 €. Without a purchase price: 5,00 €.
 */
export function suggestedPrice(costHT: number, tva: number, goodPct: number): number {
  if (!(costHT > 0)) return 5;
  const target = Math.min(90, Math.max(75, goodPct + 5));
  const p = (costHT / (1 - target / 100)) * (1 + tva);
  const step = p < 5 ? 0.1 : 0.5;
  return round2(Math.max(0.1, Math.ceil(p / step - 1e-9) * step));
}

/** Margin result of one service (null when it cannot be computed). */
export function serviceResult(
  purchaseHT: number,
  containerCl: number,
  tva: number,
  doseCl: number,
  price: number,
): ServingMarginResult | null {
  if (!(price > 0) || !(containerCl > 0) || !(doseCl > 0) || !(purchaseHT >= 0) || !(tva >= 0 && tva < 1)) return null;
  try {
    return calculateServingMargin(
      purchaseHT,
      containerCl,
      tva,
      { id: '', userId: '', name: '', volumeCl: doseCl, icon: '', sortOrder: 0 },
      price,
    );
  } catch {
    return null;
  }
}

function niceCeil(v: number): number {
  if (v <= 20) return Math.ceil(v);
  if (v <= 60) return Math.ceil(v / 5) * 5;
  if (v <= 200) return Math.ceil(v / 10) * 10;
  return Math.ceil(v / 50) * 50;
}

export interface PricingSetup {
  min: number;
  max: number;
  /** Slider step. */
  step: number;
  /** NumberInput step and typing decimals. */
  inputStep: number;
  decimals: number;
  format: (n: number) => string;
  suffix: string;
  marker?: { value: number; label: string };
  zones?: SliderZone[];
  formatLabel: (n: number) => string;
  /** « Prix de vente », « Marge », « Coefficient ». */
  label: string;
  /** Accessibility name of the value. */
  a11y: string;
}

/**
 * Ranges, marker and zones for the pricing control. `anchorPrice` widens the
 * price range for an expensive service (pass a value frozen while dragging so
 * the track never moves under the finger).
 */
export function pricingSetup(
  mode: PriceMode,
  costHT: number,
  tva: number,
  t: MarginThresholds,
  anchorPrice: number,
): PricingSetup {
  const hasCost = costHT > 0;
  if (mode === 'margin') {
    return {
      min: 0,
      max: 95,
      step: 0.5,
      inputStep: 0.5,
      decimals: 1,
      format: (n) => formatPercent(n),
      suffix: '%',
      marker: { value: t.good, label: `Objectif ${formatPercent(t.good, 0)}` },
      zones: [{ to: t.medium, color: 'bad' }, { to: t.good, color: 'warn' }, { color: 'good' }],
      formatLabel: (n) => formatPercent(n, 0),
      label: 'Marge',
      a11y: 'Marge visée',
    };
  }
  if (mode === 'coeff') {
    const objC = 1 / (1 - t.good / 100);
    const medC = 1 / (1 - t.medium / 100);
    return {
      min: 1,
      max: Math.max(8, niceCeil(objC * 2.6)),
      step: 0.05,
      inputStep: 0.05,
      decimals: 2,
      format: (n) => formatCoeff(n),
      suffix: '×',
      marker: { value: objC, label: `Objectif ${formatCoeff(objC)}` },
      zones: [{ to: medC, color: 'bad' }, { to: objC, color: 'warn' }, { color: 'good' }],
      formatLabel: (n) => `×${formatNumber(n, Number.isInteger(n) ? 0 : 1)}`,
      label: 'Coefficient',
      a11y: 'Coefficient multiplicateur',
    };
  }
  const costTTC = costHT * (1 + tva);
  const objective = priceForMargin(costHT, tva, t.good);
  const medium = hasCost ? (costHT / (1 - t.medium / 100)) * (1 + tva) : 0;
  const min = hasCost ? Math.max(0.5, Math.floor(costTTC * 2) / 2) : 0.5;
  const max = niceCeil(Math.max(10, objective * 2.2, costTTC * 5, (anchorPrice || 0) * 1.15, min + 5));
  return {
    min,
    max,
    step: 0.1,
    inputStep: 0.1,
    decimals: 2,
    format: (n) => formatEuro(n),
    suffix: '€',
    marker: hasCost && objective <= max ? { value: objective, label: `Objectif ${formatPercent(t.good, 0)} · ${formatEuro(objective)}` } : undefined,
    zones: hasCost ? [{ to: medium, color: 'bad' }, { to: objective, color: 'warn' }, { color: 'good' }] : undefined,
    formatLabel: (n) => formatEuro(n, { trimZeros: true }),
    label: 'Prix de vente',
    a11y: 'Prix de vente TTC',
  };
}

// ─── Words ─────────────────────────────────────────────────────────────────

export interface ServiceNoun {
  one: string;
  many: string;
  /** « ce verre », « cette pinte ». */
  this: string;
}

export function serviceNoun(name: string | null | undefined): ServiceNoun {
  const n = (name ?? '').toLowerCase();
  if (/shot|shooter/.test(n)) return { one: 'shot', many: 'shots', this: 'ce shot' };
  if (/pinte/.test(n)) return { one: 'pinte', many: 'pintes', this: 'cette pinte' };
  if (/demi/.test(n)) return { one: 'demi', many: 'demis', this: 'ce demi' };
  if (/verre|vin|coupe|ballon/.test(n)) return { one: 'verre', many: 'verres', this: 'ce verre' };
  if (/canette/.test(n)) return { one: 'canette', many: 'canettes', this: 'cette canette' };
  if (/bouteille/.test(n)) return { one: 'bouteille', many: 'bouteilles', this: 'cette bouteille' };
  return { one: 'dose', many: 'doses', this: 'cette dose' };
}

/** « bouteille », « fût », « contenant ». */
export function containerNoun(cl: number): string {
  if (cl >= 1500) return 'fût';
  if (cl > 150) return 'contenant';
  return 'bouteille';
}

/** « 14 verres par bouteille », « 23,3 shots par bouteille ». */
export function dosesSentence(containerCl: number, doseCl: number, noun: ServiceNoun): string | null {
  if (!(containerCl > 0) || !(doseCl > 0)) return null;
  const n = containerCl / doseCl;
  const shown = formatNumber(n, Number.isInteger(Math.round(n * 10) / 10) ? 0 : 1);
  const word = n >= 2 ? noun.many : noun.one;
  return `${shown}${NBSP}${word} par ${containerNoun(containerCl)}`;
}

/**
 * French container label: fixes the legacy preset names (« Fut 20L » →
 * « Fût 20 L », « Jeroboam » → « Jéroboam 3 L ») and appends the volume to
 * names without one. Non-breaking spaces keep each chip on one line.
 */
export function containerLabel(name: string | null | undefined, volumeCl: number): string {
  let n = (name ?? '').trim();
  if (!n) return formatVolumeCl(volumeCl);
  n = n
    .replace(/^fut\b/i, 'Fût')
    .replace(/^jeroboam\b/i, 'Jéroboam')
    .replace(/(\d)\s*l\b/gi, '$1 L')
    .replace(/(\d)\s*cl\b/gi, '$1 cl');
  if (!/\d/.test(n)) n = `${n} ${formatVolumeCl(volumeCl)}`;
  return n.replace(/ /g, NBSP);
}

/** Fiscal category (duty rate slug) → product category slug. */
export const FISCAL_TO_PRODUCT_CATEGORY: Record<string, string> = {
  vin_tranquille: 'vins',
  vin_mousseux: 'vins',
  cidre_poire: 'vins',
  boisson_fermentee: 'vins',
  prod_interm_vdl_vdn: 'vins',
  prod_interm_autre: 'spiritueux',
  biere_legere: 'bieres',
  biere: 'bieres',
  petite_brasserie: 'bieres',
  rhum_dom: 'spiritueux',
  liqueur: 'spiritueux',
  spiritueux: 'spiritueux',
  rhum_hors_dom: 'spiritueux',
};

/** Product category slug → the most likely fiscal category (for « prix hors droits »). */
export function defaultFiscalSlug(categorySlug: string | null | undefined): string {
  if (categorySlug === 'vins') return 'vin_tranquille';
  if (categorySlug === 'bieres') return 'biere';
  return 'spiritueux';
}

/** « TVA 20 % », « TVA 5,5 % », « sans TVA ». */
export function tvaLabel(tva: number): string {
  if (!(tva > 0)) return 'sans TVA';
  const pct = round2(tva * 100);
  return `TVA ${formatPercent(pct, Number.isInteger(pct) ? 0 : 1)}`;
}
