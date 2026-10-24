/**
 * Product form model: values, hydration (edit), prefill (scan / duty
 * calculator), client validation and the API payload. No React here.
 */
import {
  calculateDroits,
  Category,
  CreateProductInput,
  DroitsResult,
  MarginMode,
  ProductWithMargin,
  Rate,
  ServingType,
  User,
} from '@margebar/shared';
import type { ProductFormPrefs } from '../../../services/draft.service';
import { NBSP, formatEuro, formatVolumeCl } from '../../../utils/format';
import { doseLabel } from '../../../utils/servings';
import { FieldErrors, FieldKey } from './errors';
import {
  CUSTOM_DOSE,
  FISCAL_TO_PRODUCT_CATEGORY,
  PRICE_MAX,
  PURCHASE_MAX,
  ServiceState,
  costPerDoseHT,
  degreeMatters,
  modeValueFromPrice,
  round2,
  serviceResult,
} from './pricing';

// ─── Route params (contract) ────────────────────────────────────────────────

/**
 * Prefill accepted in `route.params.scanData` (all optional). Accepts both the
 * bottle-scan names and the duty calculator's « Enregistrer comme produit »
 * names (`SaveProductData`).
 */
export interface ProductPrefill {
  name?: string;
  /** Product category id… */
  categoryId?: string;
  /** …or its slug (spiritueux | vins | bieres | softs | ingredients_cocktails | consommables). */
  category?: string;
  /** Duty rate slug (spiritueux, biere, vin_tranquille…): also picks the category when none is given. */
  fiscalCategory?: string;
  containerVolumeCl?: number | null;
  /** Alias of containerVolumeCl (duty calculator). */
  volumeCl?: number | null;
  alcoholDegree?: number | null;
  /** Alias of alcoholDegree (duty calculator). */
  degree?: number | null;
  /** Purchase price HT, duties included. */
  purchasePriceHT?: number | null;
  /** Alias of purchasePriceHT (bottle scan). */
  estimatedPriceHT?: number | null;
  /** Duty calculator: price with duties (used when prixHTHorsDroit is absent). */
  prixHTAvecDroits?: number | null;
  /** Duty calculator: price WITHOUT duties → opens « Prix hors droits » with `fiscalCategory`. */
  prixHTHorsDroit?: number | null;
  supplier?: string | null;
  /** Photo as data URIs (rare: the form usually takes the photo itself). */
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
}

export interface ProductFormParams {
  /** Edit this product (« Modifier le produit »). */
  productId?: string;
  /** Prefill a new product; the scan step is skipped. */
  scanData?: ProductPrefill;
  /** 'form' opens the form directly (manual entry); default 'scan' for a new, empty product. */
  start?: 'scan' | 'form';
  /** Alias of `start: 'form'` (« À la main »). */
  manual?: boolean | string;
}

// ─── Values ─────────────────────────────────────────────────────────────────

export interface PhotoState {
  imageUrl: string | null;
  thumbnailUrl: string | null;
  /** True once added, replaced or removed in this session (PUT sends the photo fields only then). */
  changed: boolean;
  source: 'none' | 'scan' | 'picked' | 'saved';
}

export interface FormValues {
  name: string;
  categoryId: string | null;
  supplier: string;
  containerCl: number | null;
  /** « Autre » container chip: shows the free volume field. */
  containerOther: boolean;
  /** Purchase price HT per container: with duties, or without when `horsDroits`. */
  purchase: number | null;
  degree: number | null;
  tvaRate: number;
  horsDroits: boolean;
  fiscalSlug: string;
  /** Enabled services by servingTypeId (or CUSTOM_DOSE). */
  services: Record<string, ServiceState>;
  /** Service shown in the pricing card. */
  selected: string | null;
  customDoseCl: number | null;
  photo: PhotoState;
}

export const NO_PHOTO: PhotoState = { imageUrl: null, thumbnailUrl: null, changed: false, source: 'none' };

export function emptyValues(user: Pick<User, 'isAutoEntrepreneur' | 'defaultTvaRate' | 'defaultContainerVolumeCl'> | null | undefined): FormValues {
  return {
    name: '',
    categoryId: null,
    supplier: '',
    containerCl: user?.defaultContainerVolumeCl && user.defaultContainerVolumeCl > 0 ? user.defaultContainerVolumeCl : 70,
    containerOther: false,
    purchase: null,
    degree: null,
    tvaRate: user?.isAutoEntrepreneur ? 0 : typeof user?.defaultTvaRate === 'number' ? user.defaultTvaRate : 0.2,
    horsDroits: false,
    fiscalSlug: 'spiritueux',
    services: {},
    selected: null,
    customDoseCl: null,
    photo: NO_PHOTO,
  };
}

const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);

/** Category id from an id, a slug or a duty rate slug. */
export function resolveCategoryId(
  categories: Category[],
  hint: { categoryId?: string | null; category?: string | null; fiscalCategory?: string | null },
): string | null {
  if (hint.categoryId && categories.some((c) => c.id === hint.categoryId)) return hint.categoryId;
  const slug = hint.category || (hint.fiscalCategory ? FISCAL_TO_PRODUCT_CATEGORY[hint.fiscalCategory] : null);
  if (slug) return categories.find((c) => c.slug === slug)?.id ?? null;
  return hint.categoryId ?? null;
}

/** Applies a prefill (scan result or duty calculator) on top of `base`. */
export function applyPrefill(base: FormValues, p: ProductPrefill, categories: Category[]): FormValues {
  const next: FormValues = { ...base };
  if (p.name && p.name.trim()) next.name = p.name.trim();
  if (p.supplier) next.supplier = p.supplier;
  const cat = resolveCategoryId(categories, p);
  if (cat) next.categoryId = cat;
  const container = num(p.containerVolumeCl) ?? num(p.volumeCl);
  if (container && container > 0) next.containerCl = container;
  const degree = num(p.alcoholDegree) ?? num(p.degree);
  if (degree !== null && degree >= 0 && degree <= 100) next.degree = degree;
  const horsDroit = num(p.prixHTHorsDroit);
  if (horsDroit && horsDroit > 0 && p.fiscalCategory) {
    next.horsDroits = true;
    next.fiscalSlug = p.fiscalCategory;
    next.purchase = horsDroit;
  } else {
    const price = num(p.purchasePriceHT) ?? num(p.estimatedPriceHT) ?? num(p.prixHTAvecDroits);
    if (price && price > 0) next.purchase = round2(price);
    if (p.fiscalCategory) next.fiscalSlug = p.fiscalCategory;
  }
  if (p.imageUrl) next.photo = { imageUrl: p.imageUrl, thumbnailUrl: p.thumbnailUrl ?? null, changed: true, source: 'picked' };
  return next;
}

/**
 * Duties added to a « hors droits » price. Null while they cannot be computed:
 * no fiscal category, no container, or no degree for a category whose duties
 * depend on it (beers, spirits, fortified wines) — never « +0,00 € » for a
 * missing degree.
 */
export function dutiesFor(
  values: Pick<FormValues, 'horsDroits' | 'fiscalSlug' | 'purchase' | 'degree' | 'tvaRate'>,
  containerCl: number,
  rates: Rate[],
  seuilSS?: number,
): DroitsResult | null {
  if (!values.horsDroits) return null;
  const rate = rates.find((r) => r.slug === values.fiscalSlug);
  if (!rate || !(containerCl > 0)) return null;
  if (degreeMatters(rate) && !(values.degree !== null && values.degree > 0)) return null;
  return calculateDroits(rate, containerCl, values.degree ?? 0, values.purchase ?? 0, values.tvaRate, seuilSS);
}

/** Values of « Modifier le produit », restoring the modes saved on this device. */
export function valuesFromProduct(
  p: ProductWithMargin,
  prefs: ProductFormPrefs | null,
  user: Parameters<typeof emptyValues>[0],
  rates: Rate[],
  seuilSS?: number,
): FormValues {
  const base = emptyValues(user);
  const services: Record<string, ServiceState> = {};
  const sorted = [...(p.servings ?? [])].sort(
    (a, b) => (a.servingType?.sortOrder ?? 0) - (b.servingType?.sortOrder ?? 0) || (a.servingType?.volumeCl ?? 0) - (b.servingType?.volumeCl ?? 0),
  );
  for (const s of sorted) {
    const id = s.servingTypeId || s.servingType?.id;
    if (!id) continue;
    services[id] = { price: s.sellingPriceTTC, touched: true, mode: prefs?.modes?.[id] ?? 'price', modeValue: null };
  }
  let customDoseCl: number | null = null;
  if (!sorted.length) {
    const mode = p.marginMode === MarginMode.FIX_TARGET_MARGIN ? 'margin' : p.marginMode === MarginMode.FIX_COEFFICIENT ? 'coeff' : prefs?.modes?.[CUSTOM_DOSE] ?? 'price';
    const modeValue = mode === 'margin' ? num(p.targetMarginPercent) : mode === 'coeff' ? num(p.coefficient) : null;
    services[CUSTOM_DOSE] = {
      price: round2(p.computed?.sellingPriceTTC ?? p.sellingPriceTTC ?? 0),
      touched: true,
      mode,
      modeValue,
    };
    customDoseCl = p.doseVolumeCl;
  }

  let horsDroits = false;
  let fiscalSlug = base.fiscalSlug;
  let purchase: number | null = p.purchasePriceHT;
  const hd = prefs?.horsDroits;
  if (hd && hd.priceHorsDroits >= 0) {
    // Only restore the « hors droits » entry if it still gives the saved price.
    const d = dutiesFor(
      { horsDroits: true, fiscalSlug: hd.fiscalSlug, purchase: hd.priceHorsDroits, degree: p.alcoholDegree, tvaRate: p.tvaRate },
      p.containerVolumeCl,
      rates,
      seuilSS,
    );
    if (d && Math.abs(d.prixHTAvecDroits - p.purchasePriceHT) < 0.015) {
      horsDroits = true;
      fiscalSlug = hd.fiscalSlug;
      purchase = hd.priceHorsDroits;
    }
  }

  return {
    ...base,
    name: p.name,
    categoryId: p.categoryId,
    supplier: p.supplier ?? '',
    containerCl: p.containerVolumeCl,
    containerOther: false,
    purchase,
    degree: p.alcoholDegree > 0 ? p.alcoholDegree : null,
    tvaRate: p.tvaRate,
    horsDroits,
    fiscalSlug,
    services,
    selected: Object.keys(services)[0] ?? null,
    customDoseCl,
    photo: { imageUrl: p.imageUrl ?? null, thumbnailUrl: p.thumbnailUrl ?? null, changed: false, source: p.imageUrl ? 'saved' : 'none' },
  };
}

// ─── Derived numbers ────────────────────────────────────────────────────────

export interface Derived {
  containerCl: number;
  /** Purchase price HT per container, duties included. */
  purchaseHT: number;
  duties: DroitsResult | null;
  /** Fiscal category of the « hors droits » entry (null when it is off or unknown). */
  rate: Rate | null;
  /** « Prix hors droits » is on and the duties wait for the degree. */
  needsDegree: boolean;
  /** The cost of a dose is known (a purchase price, and the duties when « hors droits »). */
  costKnown: boolean;
  /** Dose (cl) of each enabled service. */
  doseOf: (key: string) => number;
  costOf: (key: string) => number;
}

export function derive(values: FormValues, servingTypes: ServingType[], rates: Rate[], seuilSS?: number): Derived {
  const containerCl = values.containerCl && values.containerCl > 0 ? values.containerCl : 0;
  const duties = dutiesFor(values, containerCl, rates, seuilSS);
  const rate = values.horsDroits ? rates.find((r) => r.slug === values.fiscalSlug) ?? null : null;
  const needsDegree = !!rate && degreeMatters(rate) && !(values.degree !== null && values.degree > 0);
  const hasPurchase = values.purchase !== null && isFinite(values.purchase) && values.purchase >= 0;
  const costKnown = hasPurchase && (!values.horsDroits || !!duties);
  const purchaseHT = duties ? duties.prixHTAvecDroits : values.purchase ?? 0;
  const byId = new Map(servingTypes.map((s) => [s.id, s]));
  const doseOf = (key: string) => (key === CUSTOM_DOSE ? values.customDoseCl ?? 0 : byId.get(key)?.volumeCl ?? 0);
  return {
    containerCl,
    purchaseHT,
    duties,
    rate,
    needsDegree,
    costKnown,
    doseOf,
    costOf: (key) => (costKnown ? costPerDoseHT(purchaseHT, containerCl, doseOf(key)) : 0),
  };
}

/**
 * The service's price on file is only the starting value (5,00 €), not a
 * price: nobody chose it, and no cost gives a suggestion yet (no purchase
 * price, the degree for the duties, or a product offered at 0 €). The tiles,
 * the field, the slider, the service chip and the sticky bar then say « à
 * calculer » (« à saisir » at 0 €), and the save asks for a price.
 */
export function pricePending(key: string, values: FormValues, d: Derived): boolean {
  const s = values.services[key];
  return !!s && !s.touched && !(d.costOf(key) > 0);
}

/** Margin of one enabled service (null while its price or cost is unknown). */
export function resultOf(key: string, values: FormValues, d: Derived) {
  const s = values.services[key];
  if (!s || !d.costKnown) return null;
  return serviceResult(d.purchaseHT, d.containerCl, values.tvaRate, d.doseOf(key), s.price);
}

/** Value shown in the pricing control for a service. */
export function shownModeValue(s: ServiceState, costHT: number, tva: number): number {
  if (s.mode !== 'price' && s.modeValue !== null) return s.modeValue;
  return modeValueFromPrice(s.mode, s.price, costHT, tva);
}

/** Enabled services in API order (sortOrder, then volume); the free dose last. */
export function orderedServiceKeys(values: FormValues, servingTypes: ServingType[]): string[] {
  const order = new Map(servingTypes.map((s, i) => [s.id, [s.sortOrder, s.volumeCl, i] as const]));
  return Object.keys(values.services).sort((a, b) => {
    if (a === CUSTOM_DOSE) return 1;
    if (b === CUSTOM_DOSE) return -1;
    const oa = order.get(a) ?? [999, 0, 0];
    const ob = order.get(b) ?? [999, 0, 0];
    return oa[0] - ob[0] || oa[1] - ob[1] || oa[2] - ob[2];
  });
}

export function serviceName(key: string, values: FormValues, servingTypes: ServingType[]): string {
  if (key === CUSTOM_DOSE) {
    if (!values.customDoseCl) return 'Autre dose';
    // A can or a bottle sold whole reads « À l’unité », like the card and the detail.
    return values.containerCl && values.containerCl > 0
      ? doseLabel(values.containerCl, values.customDoseCl)
      : `Dose${NBSP}${formatVolumeCl(values.customDoseCl)}`;
  }
  const st = servingTypes.find((s) => s.id === key);
  if (!st) return 'Service';
  const short = st.name.replace(/\s*\([^)]*\)\s*$/, '').trim() || st.name;
  return `${short}${NBSP}${formatVolumeCl(st.volumeCl)}`;
}

// ─── Validation & payload ───────────────────────────────────────────────────

export interface Validation {
  fields: FieldErrors;
  /** First field to scroll to. */
  first: FieldKey | null;
  /** Sentence for the toast when the error is not next to a visible field. */
  message: string | null;
}

const ORDER: FieldKey[] = ['photo', 'name', 'category', 'supplier', 'container', 'purchase', 'degree', 'tva', 'services'];

export function validate(values: FormValues, d: Derived, servingTypes: ServingType[]): Validation {
  const fields: FieldErrors = {};
  if (!values.name.trim()) fields.name = 'Le nom du produit est obligatoire.';
  else if (values.name.trim().length > 200) fields.name = 'Le nom est trop long (200 caractères maximum).';
  if (!values.categoryId) fields.category = 'Choisissez une catégorie.';
  if (!(d.containerCl > 0)) fields.container = 'Indiquez la contenance du contenant.';
  if (values.purchase === null || !isFinite(values.purchase)) fields.purchase = 'Indiquez le prix d’achat HT (0 € si offert).';
  else if (values.purchase < 0) fields.purchase = 'Le prix d’achat ne peut pas être négatif.';
  else if (values.purchase > PURCHASE_MAX || d.purchaseHT > PURCHASE_MAX) fields.purchase = purchaseMaxMessage();
  if (values.degree !== null && (values.degree < 0 || values.degree > 100)) fields.degree = 'Le degré doit être compris entre 0 et 100 % vol.';
  else if (d.needsDegree) fields.degree = DEGREE_FOR_DUTIES;
  if (values.horsDroits && !d.rate) fields.purchase = fields.purchase ?? 'Choisissez la catégorie fiscale pour calculer les droits.';

  const keys = orderedServiceKeys(values, servingTypes);
  if (!keys.length) {
    fields.services = 'Choisissez au moins un service et son prix de vente.';
  } else {
    const names = (list: string[]) => list.map((k) => `« ${serviceName(k, values, servingTypes)} »`).join(', ');
    // A starting value nobody chose is no price (an offered product, 0 €: nothing to suggest from).
    const noPrice = keys.filter((k) => !(values.services[k].price > 0) || (d.costKnown && pricePending(k, values, d)));
    const tooExpensive = keys.filter((k) => values.services[k].price > PRICE_MAX);
    const tooBig = d.containerCl > 0 ? keys.filter((k) => d.doseOf(k) > d.containerCl) : [];
    const noDose = keys.filter((k) => k === CUSTOM_DOSE && !(d.doseOf(k) > 0));
    if (noDose.length) fields.services = 'Indiquez la dose servie (en cl).';
    else if (noPrice.length) fields.services = `Indiquez un prix de vente pour ${names(noPrice)}.`;
    else if (tooExpensive.length) fields.services = `${priceMaxMessage()} (${names(tooExpensive)}).`;
    else if (tooBig.length) {
      fields.services = `${names(tooBig)} dépasse${tooBig.length > 1 ? 'nt' : ''} la contenance (${formatVolumeCl(d.containerCl)}). Retirez ${tooBig.length > 1 ? 'ces services' : 'ce service'} ou changez de contenant.`;
    }
  }
  const first = ORDER.find((k) => fields[k]) ?? null;
  const count = Object.keys(fields).length;
  return { fields, first, message: !first ? null : count > 1 ? `${count}${NBSP}champs à corriger` : fields[first] ?? null };
}

export const DEGREE_FOR_DUTIES = 'Indiquez le degré : il sert au calcul des droits.';
export const purchaseMaxMessage = () => `Prix d’achat : ${formatEuro(PURCHASE_MAX, { decimals: 0 })} maximum.`;
export const priceMaxMessage = () => `Prix de vente : ${formatEuro(PRICE_MAX, { decimals: 0 })} maximum`;

/** Services sold below their cost (the save asks before writing them). */
export function lossServices(values: FormValues, d: Derived, servingTypes: ServingType[]) {
  return orderedServiceKeys(values, servingTypes)
    .map((key) => ({ key, result: resultOf(key, values, d) }))
    .filter((x): x is { key: string; result: NonNullable<ReturnType<typeof resultOf>> } => !!x.result && x.result.marginPercent < 0);
}

/** Body of POST/PUT /api/products — the product and ALL its services in one request. */
export function buildPayload(
  values: FormValues,
  d: Derived,
  servingTypes: ServingType[],
  opts: { editing: boolean },
): CreateProductInput {
  const keys = orderedServiceKeys(values, servingTypes);
  const base = {
    name: values.name.trim(),
    categoryId: values.categoryId as string,
    purchasePriceHT: round2(d.purchaseHT),
    containerVolumeCl: d.containerCl,
    tvaRate: values.tvaRate,
    alcoholDegree: values.degree ?? 0,
    supplier: values.supplier.trim() || null,
  };
  let body: CreateProductInput;
  if (keys[0] === CUSTOM_DOSE) {
    const s = values.services[CUSTOM_DOSE];
    const dose = d.doseOf(CUSTOM_DOSE);
    const common = { ...base, doseVolumeCl: dose, sellingPriceTTC: round2(s.price) };
    if (s.mode === 'margin' && s.modeValue !== null) {
      body = { ...common, marginMode: MarginMode.FIX_TARGET_MARGIN, targetMarginPercent: Math.min(99.9, Math.max(0, round2(s.modeValue))), coefficient: undefined };
    } else if (s.mode === 'coeff' && s.modeValue !== null && s.modeValue > 0) {
      body = { ...common, marginMode: MarginMode.FIX_COEFFICIENT, coefficient: round2(s.modeValue), targetMarginPercent: undefined };
    } else {
      body = { ...common, marginMode: MarginMode.FIX_SELLING_PRICE };
    }
    // A free dose replaces any services the product had.
    if (opts.editing) body.servings = [];
    if (opts.editing) {
      (body as any).targetMarginPercent = body.targetMarginPercent ?? null;
      (body as any).coefficient = body.coefficient ?? null;
    }
  } else {
    const servings = keys.map((k) => ({ servingTypeId: k, sellingPriceTTC: round2(values.services[k].price) }));
    body = {
      ...base,
      doseVolumeCl: d.doseOf(keys[0]),
      marginMode: MarginMode.FIX_SELLING_PRICE,
      sellingPriceTTC: servings[0].sellingPriceTTC,
      servings,
    };
    if (opts.editing) {
      (body as any).targetMarginPercent = null;
      (body as any).coefficient = null;
    }
  }
  // Photo: always on create; on update only when it changed (missing = unchanged, null = remove).
  if (!opts.editing) {
    if (values.photo.imageUrl) body.imageUrl = values.photo.imageUrl;
    if (values.photo.thumbnailUrl) body.thumbnailUrl = values.photo.thumbnailUrl;
  } else if (values.photo.changed) {
    body.imageUrl = values.photo.imageUrl;
    body.thumbnailUrl = values.photo.thumbnailUrl;
  }
  return body;
}

/** Pricing modes remembered on this device for « Modifier le produit ». */
export function prefsFromValues(values: FormValues): Omit<ProductFormPrefs, 'savedAt'> {
  const modes: ProductFormPrefs['modes'] = {};
  for (const [k, s] of Object.entries(values.services)) modes[k] = s.mode;
  return {
    modes,
    horsDroits: values.horsDroits && values.purchase !== null ? { fiscalSlug: values.fiscalSlug, priceHorsDroits: values.purchase } : null,
  };
}

/** What « unsaved changes » compares (ignores UI-only state such as the selected chip). */
export function fingerprint(values: FormValues): string {
  const services: Record<string, [number, string]> = {};
  for (const [k, s] of Object.entries(values.services)) services[k] = [round2(s.price), s.mode];
  return JSON.stringify([
    values.name.trim(),
    values.categoryId,
    values.supplier.trim(),
    values.containerCl,
    values.purchase,
    values.degree,
    values.tvaRate,
    values.horsDroits,
    values.horsDroits ? values.fiscalSlug : null,
    services,
    values.customDoseCl,
    values.photo.changed ? values.photo.imageUrl?.length ?? 0 : 'same',
  ]);
}

export interface FormSummary {
  /** Enabled services. */
  count: number;
  /** Margin of the WEAKEST service (null while a price or the cost is missing). */
  margin: number | null;
  /** Coefficient of that same service. */
  coeff: number | null;
  costKnown: boolean;
  /** Several services: `margin` / `coeff` are the minimum (« marge min. »). */
  isMin: boolean;
  /** Key of the weakest service. */
  weakest: string | null;
}

/**
 * Sticky bar summary, next to « Enregistrer »: with one service its margin and
 * coefficient; with several, the WEAKEST one (« 2 services · marge min.
 * 78,4 % »), so the zone colour always means « the worst service of this
 * product » and the number says which margin it is, whichever service the
 * pricing card shows. Null while any service lacks a price (or the cost is
 * unknown): validation will ask for it.
 */
export function summaryOf(values: FormValues, d: Derived, servingTypes: ServingType[]): FormSummary {
  const keys = orderedServiceKeys(values, servingTypes);
  const n = keys.length;
  const empty: FormSummary = { count: n, margin: null, coeff: null, costKnown: d.costKnown, isMin: n > 1, weakest: null };
  let worst: { key: string; r: NonNullable<ReturnType<typeof resultOf>> } | null = null;
  for (const key of keys) {
    const r = pricePending(key, values, d) ? null : resultOf(key, values, d);
    if (!r) return empty;
    if (!worst || r.marginPercent < worst.r.marginPercent) worst = { key, r };
  }
  if (!worst) return empty;
  const coeff = worst.r.costPerServingHT > 0 ? worst.r.sellingPriceHT / worst.r.costPerServingHT : null;
  return { ...empty, margin: worst.r.marginPercent, coeff, weakest: worst.key };
}
