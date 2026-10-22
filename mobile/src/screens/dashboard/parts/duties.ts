/**
 * Calculator helpers: French container labels, typical degree / container per
 * fiscal category, fiscal → product category mapping, group icons.
 */
import { CONTAINER_PRESETS, type Rate } from '@margebar/shared';
import type { IconName } from '../../../components/ui';
import { formatVolumeCl, NBSP } from '../../../utils/format';

/** « Fut 30L » → « Fût 30 L », « Jeroboam » → « Jéroboam », non-breaking spaces. */
export function containerLabel(label: string): string {
  return label
    .replace(/^Fut\b/, 'Fût')
    .replace(/^Jeroboam$/, 'Jéroboam')
    .replace(/(\d)\s*L$/, `$1${NBSP}L`)
    .replace(/ /g, NBSP);
}

export const CONTAINERS = CONTAINER_PRESETS.map((p) => ({ key: String(p.volumeCl), volumeCl: p.volumeCl, label: containerLabel(p.label) }));

/** « Bouteille · 70 cl », « Fût · 30 L », « Magnum · 1,5 L ». */
export function containerMeta(volumeCl: number): string {
  let kind = 'Bouteille';
  if (volumeCl <= 5) kind = 'Dose';
  else if (volumeCl < 20) kind = 'Verre';
  else if (volumeCl <= 100) kind = 'Bouteille';
  else if (volumeCl <= 150) kind = 'Magnum';
  else if (volumeCl <= 300) kind = 'Jéroboam';
  else if (volumeCl <= 1000) kind = 'Bag-in-box';
  else kind = 'Fût';
  return `${kind} · ${formatVolumeCl(volumeCl)}`;
}

interface CategoryDefaults {
  /** Typical strength used when the category changes. */
  degree: number;
  /** Plausible range: a degree outside it is replaced by the typical one. */
  min: number;
  max: number;
  /** Typical container (cl), applied while the user has not picked one. */
  volumeCl: number;
}

const DEFAULTS: Record<string, CategoryDefaults> = {
  spiritueux: { degree: 40, min: 15, max: 80, volumeCl: 70 },
  rhum_dom: { degree: 50, min: 15, max: 80, volumeCl: 70 },
  rhum_hors_dom: { degree: 40, min: 15, max: 80, volumeCl: 70 },
  liqueur: { degree: 25, min: 15, max: 60, volumeCl: 70 },
  biere: { degree: 5, min: 2.9, max: 15, volumeCl: 33 },
  petite_brasserie: { degree: 6, min: 2.9, max: 15, volumeCl: 33 },
  biere_legere: { degree: 2, min: 0.5, max: 2.8, volumeCl: 33 },
  vin_tranquille: { degree: 12.5, min: 8.5, max: 15, volumeCl: 75 },
  vin_mousseux: { degree: 12, min: 8.5, max: 15, volumeCl: 75 },
  cidre_poire: { degree: 5, min: 1.2, max: 8.5, volumeCl: 75 },
  boisson_fermentee: { degree: 6, min: 1.2, max: 15, volumeCl: 75 },
  prod_interm_vdl_vdn: { degree: 17, min: 15, max: 22, volumeCl: 75 },
  prod_interm_autre: { degree: 16, min: 15, max: 22, volumeCl: 75 },
};

const BY_TYPE: Record<string, CategoryDefaults> = {
  C: DEFAULTS.spiritueux,
  B: DEFAULTS.biere,
  A: DEFAULTS.vin_tranquille,
};

export function categoryDefaults(rate: Pick<Rate, 'slug' | 'calcType'>): CategoryDefaults {
  return DEFAULTS[rate.slug] ?? BY_TYPE[rate.calcType] ?? DEFAULTS.spiritueux;
}

/** Fiscal category (rate slug) → product category slug (for the product form prefill). */
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

export function rateIcon(rate: Pick<Rate, 'calcType'>): IconName {
  return rate.calcType === 'B' ? 'beer-outline' : rate.calcType === 'A' ? 'wine-outline' : 'flask-outline';
}

/**
 * Short description for the picker card: of the two halves around « — »,
 * the one that lists examples (more commas), e.g. « Whisky, vodka, gin… »
 * for Spiritueux but « Cidre brut, demi-sec… » for Cidre.
 */
export function rateExamples(rate: Pick<Rate, 'examples'>): string {
  const ex = (rate.examples ?? '').trim();
  const i = ex.indexOf('—');
  if (i < 0) return ex;
  const before = ex.slice(0, i).trim();
  const after = ex.slice(i + 1).trim();
  const commas = (s: string) => (s.match(/,/g) ?? []).length;
  return commas(after) > commas(before) ? after : before;
}
