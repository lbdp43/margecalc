/**
 * Invoice review model: one editable line per product read on the invoice.
 *
 * The selling price follows the backend's import rule (POST /api/products/import):
 * when it is left empty, it is derived as cost per dose × 4 × (1 + TVA), rounded
 * to 0,10 € (`deriveSellingPriceTTC`), with the same default dose per category.
 * The screen shows that price with « calculé ×4 » so it is never 0 and never a
 * surprise.
 *
 * A line linked to a product the user already tracks is NOT created: the
 * backend only updates that product's purchase price and keeps its selling
 * price. Lot 2: the link comes from POST /api/products/import/preview (exact
 * name, a label remembered for this supplier, or a look-alike name the user
 * confirms or refuses), see `resolveTarget`; without the preview, the exact
 * name and container (`findExisting`). The review shows the margin the
 * product will have after the import, and the purchase price before → after.
 */
import {
  DEFAULT_CATEGORIES,
  IMPORT_DEFAULT_COEFFICIENT,
  MarginMode,
  calculateMargin,
  deriveSellingPriceTTC,
  type Category,
  type ImportLineResult,
  type ImportPreviewLine,
  type ImportProductLine,
  type InvoiceScanProduct,
  type ProductWithMargin,
} from '@margebar/shared';
import { doseLabel as productDoseLabel } from '../../utils/servings';
import { NBSP, formatNumber, formatVolumeCl, parseLocaleFloat } from '../../utils/format';

export type LineField = 'name' | 'category' | 'quantity' | 'container' | 'degree' | 'purchase' | 'selling';
export type LineErrors = Partial<Record<LineField, string>>;

export interface InvoiceLine {
  /** Local key (stable across edits). */
  id: string;
  /** Position on the invoice (0-based) — or after the OCR lines for manual ones. */
  position: number;
  source: 'ocr' | 'manual';
  selected: boolean;
  name: string;
  /** Chosen category (id from /api/categories), when known. */
  categoryId: string | null;
  /** Category slug (from the OCR, or the chosen category's). */
  categorySlug: string;
  quantity: number | null;
  containerVolumeCl: number | null;
  purchasePriceHT: number | null;
  /** null = derived with the ×4 rule at import. */
  sellingPriceTTC: number | null;
  alcoholDegree: number | null;
  confidence: number;
  /** The backend's error for this line after the last import. */
  importError?: { message: string; field: LineField | null } | null;
  /** Lot 2 — the user's choice: follow the matching, link to a product, or create a new one. */
  link: LineLink;
}

export interface PricingContext {
  /** User TVA (0 for auto-entrepreneurs). */
  tvaRate: number;
  /** User default container (70 cl). */
  defaultContainerCl: number;
}

// ─── Backend rules mirrored here ───────────────────────────────────────────
// backend/src/services/product.service.ts (importProducts). They are not in
// @margebar/shared yet; keep both in sync.
const DEFAULT_DOSE_BY_SLUG: Record<string, number> = { vins: 12, bieres: 25, softs: 25 };
const UNIT_SOLD_SLUGS = new Set(['bieres', 'softs']);
/** Same normalisation as the backend's product match: no accents, lower case, single spaces. */
export const normName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
const round3 = (n: number) => Math.round(n * 1000) / 1000;

let seq = 0;
export const newLineId = () => `line-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** Category chips when /api/categories is unavailable and nothing is cached: the 6 built-in ones (by slug). */
export const FALLBACK_CATEGORIES: { slug: string; name: string }[] = DEFAULT_CATEGORIES.map((c) => ({ slug: c.slug, name: c.name }));

export function categoryName(slug: string): string {
  return FALLBACK_CATEGORIES.find((c) => c.slug === slug)?.name ?? 'Spiritueux';
}

export function linesFromScan(products: InvoiceScanProduct[], categories: Category[]): InvoiceLine[] {
  return products.map((p, i) => {
    const cat = categories.find((c) => c.slug === p.category && !c.userId) ?? categories.find((c) => c.slug === p.category);
    return {
      id: newLineId(),
      position: i,
      source: 'ocr',
      // Lines the reader is unsure of start unticked: the user opts them in.
      selected: !(typeof p.confidence === 'number' && p.confidence < 0.5),
      name: (p.name ?? '').trim(),
      categoryId: cat?.id ?? null,
      categorySlug: p.category || 'spiritueux',
      quantity: p.quantity > 0 ? p.quantity : null,
      containerVolumeCl: p.containerVolumeCl && p.containerVolumeCl > 0 ? p.containerVolumeCl : null,
      purchasePriceHT: p.purchasePriceHT && p.purchasePriceHT > 0 ? p.purchasePriceHT : null,
      sellingPriceTTC: null,
      alcoholDegree: typeof p.alcoholDegree === 'number' && p.alcoholDegree > 0 ? p.alcoholDegree : null,
      confidence: typeof p.confidence === 'number' ? p.confidence : 1,
      link: AUTO_LINK,
    };
  });
}

export function emptyLine(position: number, categories: Category[]): InvoiceLine {
  const cat = categories.find((c) => c.slug === 'spiritueux') ?? categories[0];
  return {
    id: newLineId(),
    position,
    source: 'manual',
    selected: true,
    name: '',
    categoryId: cat?.id ?? null,
    categorySlug: cat?.slug ?? 'spiritueux',
    quantity: 1,
    containerVolumeCl: null,
    purchasePriceHT: null,
    sellingPriceTTC: null,
    alcoholDegree: null,
    confidence: 1,
    link: AUTO_LINK,
  };
}

export function containerOf(line: Pick<InvoiceLine, 'containerVolumeCl'>, ctx: PricingContext): number {
  return line.containerVolumeCl && line.containerVolumeCl > 0 ? line.containerVolumeCl : ctx.defaultContainerCl > 0 ? ctx.defaultContainerCl : 70;
}

/** Dose used by the import for this line (same rule as the backend). */
export function doseOf(line: Pick<InvoiceLine, 'containerVolumeCl' | 'categorySlug'>, ctx: PricingContext): { doseCl: number; soldByUnit: boolean } {
  const container = containerOf(line, ctx);
  const soldByUnit = UNIT_SOLD_SLUGS.has(line.categorySlug) && container <= 50;
  const raw = soldByUnit ? container : DEFAULT_DOSE_BY_SLUG[line.categorySlug] ?? 5;
  return { doseCl: Math.min(raw, container), soldByUnit };
}

/** The ×4 price the backend will derive (0 when the purchase price is missing). */
export function derivedPrice(line: InvoiceLine, ctx: PricingContext): number {
  const { doseCl } = doseOf(line, ctx);
  return deriveSellingPriceTTC(line.purchasePriceHT ?? 0, containerOf(line, ctx), doseCl, ctx.tvaRate, IMPORT_DEFAULT_COEFFICIENT);
}

/** The price a NEW product will get: the user's, else the ×4 one. */
export function effectivePrice(line: InvoiceLine, ctx: PricingContext): { price: number; derived: boolean } {
  if (line.sellingPriceTTC && line.sellingPriceTTC > 0) return { price: line.sellingPriceTTC, derived: false };
  return { price: derivedPrice(line, ctx), derived: true };
}

/** « dose 5 cl » / « à l’unité · 33 cl » */
export function doseLabel(line: InvoiceLine, ctx: PricingContext): string {
  const { doseCl, soldByUnit } = doseOf(line, ctx);
  return soldByUnit ? `à l’unité · ${formatVolumeCl(doseCl)}` : `dose ${formatVolumeCl(doseCl)}`;
}

/** « 70 cl », « Fût 30 L » for beer kegs. */
export function containerLabel(cl: number | null | undefined, slug?: string): string | null {
  if (!cl || !(cl > 0)) return null;
  if (slug === 'bieres' && cl >= 1000) return `Fût ${formatVolumeCl(cl)}`;
  return formatVolumeCl(cl);
}

// ─── The user's products ──────────────────────────────────────────────────

export interface ExistingProduct {
  id: string;
  name: string;
  containerVolumeCl: number;
  doseVolumeCl: number;
  purchasePriceHT: number;
  tvaRate: number;
  marginMode: MarginMode;
  /** The price the product is sold at today (primary service). */
  sellingPriceTTC: number;
  targetMarginPercent: number | null;
  coefficient: number | null;
  /** Margin today (primary service), null when unknown. */
  marginPercent: number | null;
  categoryName: string | null;
  categorySlug: string | null;
  /** « Verre 5 cl », « À l’unité »: the service the headline price is for. */
  primaryLabel: string;
}

/**
 * The user's products: by id (a link chosen in the review), by normalised
 * name + container (the exact match, used when the preview is unavailable)
 * and sorted by name (the « Choisir un autre produit » sheet).
 */
export interface ProductCatalog {
  byId: Map<string, ExistingProduct>;
  byKey: Map<string, ExistingProduct>;
  list: ExistingProduct[];
}

/** Kept for the callers that only need the exact-name index. */
export type ExistingIndex = ProductCatalog;

export const EMPTY_CATALOG: ProductCatalog = { byId: new Map(), byKey: new Map(), list: [] };

const existingKey = (name: string, containerCl: number) => `${normName(name)}|${containerCl}`;

/** Index of the user's products (oldest first for the exact match, like the backend). */
export function indexProducts(products: ProductWithMargin[] | undefined | null): ProductCatalog {
  if (!products?.length) return EMPTY_CATALOG;
  const byId = new Map<string, ExistingProduct>();
  const byKey = new Map<string, ExistingProduct>();
  const sorted = [...products].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const p of sorted) {
    if (!p?.id || !p.name) continue;
    const e: ExistingProduct = {
      id: p.id,
      name: p.name,
      containerVolumeCl: p.containerVolumeCl,
      doseVolumeCl: p.doseVolumeCl,
      purchasePriceHT: p.purchasePriceHT,
      tvaRate: p.tvaRate,
      marginMode: p.marginMode,
      sellingPriceTTC: p.computed?.sellingPriceTTC ?? p.sellingPriceTTC ?? 0,
      targetMarginPercent: p.targetMarginPercent,
      coefficient: p.coefficient,
      marginPercent: typeof p.computed?.marginPercent === 'number' && Number.isFinite(p.computed.marginPercent) ? p.computed.marginPercent : null,
      categoryName: p.category?.name ?? null,
      categorySlug: p.category?.slug ?? null,
      primaryLabel: primaryLabelOf(p),
    };
    byId.set(p.id, e);
    if (p.containerVolumeCl > 0) {
      const key = existingKey(p.name, p.containerVolumeCl);
      if (!byKey.has(key)) byKey.set(key, e);
    }
  }
  const list = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  return { byId, byKey, list };
}

/** « Verre 5 cl » (primary service, lowest sortOrder, like ProductCard), else « À l’unité » / « Dose 25 cl ». */
function primaryLabelOf(p: ProductWithMargin): string {
  const first = [...(p.servings ?? [])].filter((x) => x.servingType).sort((a, b) => (a.servingType!.sortOrder ?? 0) - (b.servingType!.sortOrder ?? 0))[0];
  if (first?.servingType) {
    const short = first.servingType.name.replace(/\s*\([^)]*\)\s*$/, '').trim() || first.servingType.name;
    return `${short}${NBSP}${formatVolumeCl(first.servingType.volumeCl)}`;
  }
  return productDoseLabel(p.containerVolumeCl, p.doseVolumeCl);
}

/** Same name and container as a product already tracked (the backend's « exact » match, without the ± 1 cl). */
export function findExisting(
  line: Pick<InvoiceLine, 'name' | 'containerVolumeCl'>,
  catalog: ProductCatalog | null | undefined,
  ctx: PricingContext,
): ExistingProduct | null {
  if (!catalog || !catalog.byKey.size) return null;
  const name = line.name.trim();
  if (!name) return null;
  return catalog.byKey.get(existingKey(name, containerOf(line, ctx))) ?? null;
}

// ─── Matching (lot 2: POST /api/products/import/preview) ───────────────────
//
// The preview says, for each line, what /import would do without flags:
// update a product with the same name (« exact »), update the product this
// supplier's label was linked to before (« alias »), or create a product.
// A look-alike name (« fuzzy », e.g. « Côtes du Rhône Rouge 2022 » for
// « Côtes du Rhône rouge ») is a QUESTION: /import would create a duplicate
// unless the user confirms the link, so the review asks and sends `productId`
// (link, remembered for the supplier) or `createNew` (refused). Never
// `autoLinkFuzzy`.

/** The user's decision for a line. */
export type LineLink =
  /** Follow the preview: exact / alias update, or creation. A fuzzy match still has to be decided. */
  | { kind: 'auto' }
  /** Update THIS product (`productId` is sent; the backend remembers it for the supplier). */
  | { kind: 'product'; productId: string; name: string; containerVolumeCl: number; via: 'suggestion' | 'picked' }
  /** Create a new product even if a name matches (`createNew: true`). */
  | { kind: 'create' };

export const AUTO_LINK: LineLink = { kind: 'auto' };

/** The product before this line (primary service). */
export interface PreviousState {
  purchasePriceHT: number | null;
  marginPercent: number | null;
  sellingPriceTTC: number | null;
  servingName: string | null;
}

export interface MatchSuggestion {
  productId: string;
  name: string;
  containerVolumeCl: number;
  score: number;
}

export type LineTarget =
  /** Only the purchase price of this product changes. */
  | {
      kind: 'update';
      productId: string;
      name: string;
      containerVolumeCl: number;
      product: ExistingProduct | null;
      /** exact | alias (automatic), fuzzy (a suggestion the user confirmed), manual (picked in the sheet). */
      reason: 'exact' | 'alias' | 'fuzzy' | 'manual';
      /** The user chose it (`productId` is sent). */
      explicit: boolean;
      previous: PreviousState | null;
      suggestions: MatchSuggestion[];
      /** Same label as this earlier line (index in the review list), which the user linked to this product. */
      viaLine?: number;
    }
  /** A look-alike product: « Ressemble à … · Mettre à jour ce produit ? ». */
  | {
      kind: 'decide';
      productId: string;
      name: string;
      containerVolumeCl: number;
      score: number;
      product: ExistingProduct | null;
      previous: PreviousState | null;
      suggestions: MatchSuggestion[];
    }
  /**
   * The product an earlier ticked line of this invoice creates (same label
   * twice): created by that line, then only its purchase price is updated by
   * this one. `lineIndex` is the source line's index in the review list.
   */
  | { kind: 'sameAs'; lineIndex: number; name: string; source: InvoiceLine }
  /** A new product. `forced`: the user refused the matches. */
  | { kind: 'create'; forced: boolean; suggestions: MatchSuggestion[] };

function previousOf(p: ImportPreviewLine['previous'] | undefined | null): PreviousState | null {
  if (!p) return null;
  return {
    purchasePriceHT: typeof p.purchasePriceHT === 'number' ? p.purchasePriceHT : null,
    marginPercent: typeof p.marginPercent === 'number' && Number.isFinite(p.marginPercent) ? p.marginPercent : null,
    sellingPriceTTC: typeof p.sellingPriceTTC === 'number' ? p.sellingPriceTTC : null,
    servingName: p.servingName ?? null,
  };
}

function previousFromProduct(p: ExistingProduct | null): PreviousState | null {
  if (!p) return null;
  return { purchasePriceHT: p.purchasePriceHT, marginPercent: p.marginPercent, sellingPriceTTC: p.sellingPriceTTC || null, servingName: null };
}

/** The match and the candidates of a preview line, best first, without duplicates. */
export function suggestionsOf(preview: ImportPreviewLine | null | undefined): MatchSuggestion[] {
  const out: MatchSuggestion[] = [];
  const seen = new Set<string>();
  const m = preview?.match;
  if (m && m.productId) {
    out.push({ productId: m.productId, name: m.name, containerVolumeCl: m.containerVolumeCl, score: m.score });
    seen.add(m.productId);
  }
  for (const c of preview?.candidates ?? []) {
    if (!c?.productId || seen.has(c.productId)) continue;
    seen.add(c.productId);
    out.push({ productId: c.productId, name: c.name, containerVolumeCl: c.containerVolumeCl, score: c.score });
  }
  return out;
}

/**
 * A preview line as the review keeps it: `match.sameAsLine` is rewritten to
 * the source line's index in the review list, and `sameAsId` is that line's id
 * (the preview only sees the ticked lines, in their order).
 */
export type StoredPreviewLine = ImportPreviewLine & { sameAsId?: string };

/**
 * What the import will do with this line, from the user's choice, then the
 * preview, then (preview unavailable) the exact name and container.
 * `lines`: the review list, to find the line a « same product » match points at.
 */
export function resolveTarget(
  line: InvoiceLine,
  preview: StoredPreviewLine | null | undefined,
  catalog: ProductCatalog | null | undefined,
  ctx: PricingContext,
  lines?: InvoiceLine[],
): LineTarget {
  const link = line.link ?? AUTO_LINK;
  const suggestions = suggestionsOf(preview);
  if (link.kind === 'product') {
    const product = catalog?.byId.get(link.productId) ?? null;
    const fromPreview = preview?.match?.productId === link.productId ? previousOf(preview.previous) : null;
    return {
      kind: 'update',
      productId: link.productId,
      name: product?.name ?? link.name,
      containerVolumeCl: product?.containerVolumeCl ?? link.containerVolumeCl,
      product,
      reason: link.via === 'suggestion' ? 'fuzzy' : 'manual',
      explicit: true,
      previous: fromPreview ?? previousFromProduct(product),
      suggestions,
    };
  }
  if (link.kind === 'create') return { kind: 'create', forced: true, suggestions };
  if (preview) {
    const m = preview.match;
    if (!m) return { kind: 'create', forced: false, suggestions };
    if ((!m.productId || typeof m.sameAsLine === 'number') && m.reason === 'fuzzy') {
      // A look-alike of a product this invoice only creates: /import (no `autoLinkFuzzy`) creates this one too.
      return { kind: 'create', forced: false, suggestions };
    }
    if (!m.productId || typeof m.sameAsLine === 'number') {
      // The product a ticked earlier line creates. When that line is not imported (unticked since, or gone),
      // the preview says nothing about this one: fall back to the exact name below.
      const src = sameAsSource(preview, lines);
      const srcLink = src?.line.link ?? AUTO_LINK;
      if (src && srcLink.kind === 'product') {
        // Line N was linked by the user: this line updates the same product (`productId` is sent for both).
        const product = catalog?.byId.get(srcLink.productId) ?? null;
        const srcPurchase = src.line.purchasePriceHT && src.line.purchasePriceHT > 0 ? round3(src.line.purchasePriceHT) : null;
        const afterSrc = product ? marginAfterUpdate(product, srcPurchase) : null;
        return {
          kind: 'update',
          productId: srcLink.productId,
          name: product?.name ?? srcLink.name,
          containerVolumeCl: product?.containerVolumeCl ?? srcLink.containerVolumeCl,
          product,
          reason: 'manual',
          explicit: true,
          previous: product ? { purchasePriceHT: srcPurchase ?? product.purchasePriceHT, marginPercent: afterSrc?.marginPercent ?? null, sellingPriceTTC: afterSrc?.price ?? null, servingName: null } : null,
          suggestions,
          viaLine: src.index,
        };
      }
      if (src) return { kind: 'sameAs', lineIndex: src.index, name: src.line.name.trim() || m.name, source: src.line };
    } else {
      const product = catalog?.byId.get(m.productId) ?? null;
      const previous = previousOf(preview.previous) ?? previousFromProduct(product);
      if (m.reason === 'fuzzy') {
        return { kind: 'decide', productId: m.productId, name: m.name, containerVolumeCl: m.containerVolumeCl, score: m.score, product, previous, suggestions };
      }
      return {
        kind: 'update',
        productId: m.productId,
        name: m.name,
        containerVolumeCl: m.containerVolumeCl,
        product,
        reason: m.reason,
        explicit: false,
        previous,
        suggestions,
      };
    }
  }
  const exact = findExisting(line, catalog, ctx);
  if (exact) {
    return {
      kind: 'update',
      productId: exact.id,
      name: exact.name,
      containerVolumeCl: exact.containerVolumeCl,
      product: exact,
      reason: 'exact',
      explicit: false,
      previous: previousFromProduct(exact),
      suggestions: [],
    };
  }
  return { kind: 'create', forced: false, suggestions: [] };
}

/** The ticked line a « same product » match points at, with its index in the review list. */
function sameAsSource(preview: StoredPreviewLine, lines: InvoiceLine[] | undefined): { line: InvoiceLine; index: number } | null {
  if (!lines?.length) return null;
  let index = preview.sameAsId ? lines.findIndex((l) => l.id === preview.sameAsId) : -1;
  if (index < 0 && !preview.sameAsId && typeof preview.match?.sameAsLine === 'number') index = preview.match.sameAsLine;
  const line = index >= 0 ? lines[index] : undefined;
  return line && line.selected ? { line, index } : null;
}

/** True when the line updates an existing product (its selling price is kept). */
export const updatesProduct = (t: LineTarget) => t.kind === 'update';

/** The fields the preview depends on: a change asks the server again. */
export function previewKeyOf(lines: InvoiceLine[], supplier: string): string {
  return JSON.stringify([
    supplier.trim(),
    // `selected`: only the ticked lines are previewed (the preview reads them in order), so ticking asks again.
    lines.map((l) => [l.id, l.selected, l.name.trim(), l.categoryId ?? l.categorySlug, l.containerVolumeCl, l.purchasePriceHT, l.sellingPriceTTC, l.alcoholDegree]),
  ]);
}

export interface LinePreview {
  /** Selling price TTC per dose after the import. */
  price: number;
  /** True for the ×4 price (new product, no price typed). */
  derived: boolean;
  /** Margin % after the import (null when it cannot be computed yet). */
  marginPercent: number | null;
  target: LineTarget;
  /** The product this line would update (its selling price is kept), when known. */
  existing: ExistingProduct | null;
  /** The matching has not answered for this line yet (its target is a guess): show it as pending. */
  pending?: boolean;
}

/** Margin of an existing product once its purchase price is `purchase` (its pricing mode is kept). */
function marginAfterUpdate(existing: ExistingProduct, purchase: number | null): { price: number; marginPercent: number | null } {
  let result: { sellingPriceTTC: number; marginPercent: number } | null = null;
  try {
    result = calculateMargin({
      purchasePriceHT: purchase ?? existing.purchasePriceHT,
      containerVolumeCl: existing.containerVolumeCl,
      doseVolumeCl: existing.doseVolumeCl,
      marginMode: existing.marginMode,
      sellingPriceTTC: existing.sellingPriceTTC || undefined,
      targetMarginPercent: existing.targetMarginPercent ?? undefined,
      coefficient: existing.coefficient ?? undefined,
      tvaRate: existing.tvaRate,
    });
  } catch {
    result = null;
  }
  return {
    price: result?.sellingPriceTTC ?? existing.sellingPriceTTC,
    marginPercent: result && Number.isFinite(result.marginPercent) ? result.marginPercent : null,
  };
}

/** What the product will look like after the import: price, margin, target. */
export function previewLine(line: InvoiceLine, ctx: PricingContext, target: LineTarget): LinePreview {
  const purchase = line.purchasePriceHT && line.purchasePriceHT > 0 ? round3(line.purchasePriceHT) : null;
  if (target.kind === 'update' || target.kind === 'decide') {
    const existing = target.product;
    if (existing) {
      const after = marginAfterUpdate(existing, purchase);
      return { price: after.price, derived: false, marginPercent: after.marginPercent, target, existing };
    }
    return { price: target.previous?.sellingPriceTTC ?? 0, derived: false, marginPercent: null, target, existing: null };
  }
  if (target.kind === 'sameAs') {
    // Line N creates the product at ITS price (typed, or ×4 from its own purchase price), with its container and
    // dose; this line then only changes the purchase price.
    const src = target.source;
    const { price } = effectivePrice(src, ctx);
    return { price, derived: false, marginPercent: purchase && price > 0 ? marginFor(purchase, src, price, ctx) : null, target, existing: null };
  }
  const { price, derived } = effectivePrice(line, ctx);
  return { price, derived, marginPercent: purchase && price > 0 ? marginFor(purchase, line, price, ctx) : null, target, existing: null };
}

/** « +10,5 % » change of a purchase price (null when it cannot be said). */
export function changePercent(before: number | null | undefined, after: number | null | undefined): number | null {
  if (typeof before !== 'number' || typeof after !== 'number' || !(before > 0) || !Number.isFinite(after)) return null;
  return ((after - before) / before) * 100;
}

/** Same price to the cent. */
export const samePurchase = (a: number | null | undefined, b: number | null | undefined) =>
  typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.0005;

/** A suggestion whose container differs from the line's by more than 1 cl (linking it would apply a wrong price). */
export function containerDiffers(line: Pick<InvoiceLine, 'containerVolumeCl'>, productCl: number | null | undefined, ctx: PricingContext): boolean {
  if (!(typeof productCl === 'number' && productCl > 0)) return false;
  return Math.abs(containerOf(line, ctx) - productCl) > 1;
}

function marginFor(purchase: number, line: InvoiceLine, price: number, ctx: PricingContext): number | null {
  try {
    const r = calculateMargin({
      purchasePriceHT: purchase,
      containerVolumeCl: containerOf(line, ctx),
      doseVolumeCl: doseOf(line, ctx).doseCl,
      marginMode: MarginMode.FIX_SELLING_PRICE,
      sellingPriceTTC: price,
      tvaRate: ctx.tvaRate,
    });
    return Number.isFinite(r.marginPercent) ? r.marginPercent : null;
  } catch {
    return null;
  }
}

// ─── Validation ────────────────────────────────────────────────────────────

/**
 * Strict number parsing for the editor: « 12,3,4 » or « 1.2.3 » is NaN (never
 * silently turned into 123,4). Accepts one decimal separator, spaces / NBSP,
 * « € », « % », « vol. »; « 1 234,50 » and « 1.234,50 » are fine.
 */
export function parseStrictNumber(input: string): number {
  const t = input.replace(/[\s  €%]/g, '').replace(/vol\.?/gi, '');
  if (!t) return NaN;
  const commas = (t.match(/,/g) || []).length;
  const dots = (t.match(/\./g) || []).length;
  if (commas > 1) return NaN;
  if (dots > 1 && commas === 0) return NaN;
  if (commas === 1 && dots > 0 && t.lastIndexOf('.') > t.indexOf(',')) return NaN; // « 1,234.5 » is ambiguous here
  if (!/^[+-]?[\d.,]+$/.test(t) || !/\d/.test(t)) return NaN;
  return parseLocaleFloat(t);
}

export function validateLine(line: InvoiceLine): LineErrors {
  const e: LineErrors = {};
  const name = line.name.trim();
  if (!name) e.name = 'Indiquez le nom du produit.';
  else if (name.length > 200) e.name = 'Nom trop long (200 caractères maximum).';
  if (!(line.purchasePriceHT && line.purchasePriceHT > 0)) e.purchase = 'Indiquez le prix d’achat HT d’une bouteille ou d’une unité.';
  else if (line.purchasePriceHT > 100000) e.purchase = 'Prix d’achat trop élevé.';
  if (line.containerVolumeCl !== null && !(line.containerVolumeCl > 0 && line.containerVolumeCl <= 100000)) e.container = 'Contenance invalide.';
  if (line.alcoholDegree !== null && !(line.alcoholDegree >= 0 && line.alcoholDegree <= 100)) e.degree = 'Degré entre 0 et 100 % vol.';
  if (line.sellingPriceTTC !== null) {
    if (!(line.sellingPriceTTC > 0)) e.selling = 'Indiquez un prix supérieur à 0 €, ou laissez vide pour le calcul ×4.';
    else if (line.sellingPriceTTC > 100000) e.selling = 'Prix de vente trop élevé.';
  }
  if (line.quantity !== null && !(line.quantity >= 0 && line.quantity <= 1000000)) e.quantity = 'Quantité invalide.';
  return e;
}

export const hasErrors = (e: LineErrors) => Object.keys(e).length > 0;

/**
 * Which field a backend line error is about (to outline it). The import
 * results carry only the sentence, so this reads it.
 */
export function errorField(message: string): LineField | null {
  const m = message.toLowerCase();
  if (/prix d.achat/.test(m)) return 'purchase';
  if (/prix de vente/.test(m)) return 'selling';
  if (/degr/.test(m)) return 'degree';
  if (/catégorie|categorie/.test(m)) return 'category';
  if (/contenan|contenant|volume|dose/.test(m)) return 'container';
  if (/quantit/.test(m)) return 'quantity';
  if (/nom/.test(m)) return 'name';
  return null;
}

/**
 * The line as sent to POST /api/products/import (and /preview). With a
 * target: `productId` for a link the user chose, `createNew` for a match they
 * refused, and no selling price for a product that keeps its own.
 */
export function toImportLine(line: InvoiceLine, categories: Category[], supplier: string, target: LineTarget | null): ImportProductLine {
  const known = line.categoryId ? categories.some((c) => c.id === line.categoryId) : false;
  // An update (and « same product as line N », created by that line) keeps the product's selling price.
  const keepsPrice = !!target && target.kind !== 'create';
  const link = line.link ?? AUTO_LINK;
  return {
    name: line.name.trim(),
    ...(known ? { categoryId: line.categoryId! } : { category: line.categorySlug }),
    purchasePriceHT: line.purchasePriceHT,
    containerVolumeCl: line.containerVolumeCl,
    // An existing product keeps its selling price: never send one the API would ignore.
    sellingPriceTTC: !keepsPrice && line.sellingPriceTTC && line.sellingPriceTTC > 0 ? line.sellingPriceTTC : null,
    alcoholDegree: line.alcoholDegree,
    quantity: line.quantity,
    supplier: supplier.trim() || null,
    // A link the user chose (or the one of an earlier line with the same label): update THAT product.
    ...(target && target.kind === 'update' && target.explicit ? { productId: target.productId } : null),
    ...(target && link.kind === 'create' ? { createNew: true } : null),
  };
}

/** Σ quantity × purchase price of the selected lines. */
export function selectedTotalHT(lines: InvoiceLine[]): number {
  let t = 0;
  for (const l of lines) if (l.selected && l.purchasePriceHT && l.purchasePriceHT > 0) t += l.purchasePriceHT * (l.quantity && l.quantity > 0 ? l.quantity : 1);
  return Math.round(t * 100) / 100;
}

/** Decimals for a unit price: 3 for a per-bottle price from a pack (0,467), else 2. */
export const priceDecimals = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) > 1e-6 ? 3 : 2;

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** '2026-10-14' → « 14 octobre 2026 » (« 1er » for the first). */
export function formatInvoiceDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const d = parseInt(m[3], 10);
  const mo = parseInt(m[2], 10) - 1;
  if (!(mo >= 0 && mo < 12) || !(d >= 1 && d <= 31)) return null;
  return `${d === 1 ? '1er' : d}${NBSP}${MONTHS[mo]} ${m[1]}`;
}

/** « ×6 », « ×96 » */
export const quantityLabel = (q: number | null) => (q && q > 0 ? `×${formatNumber(q, q % 1 ? 1 : 0)}` : null);

export interface LineOutcome {
  line: InvoiceLine;
  result: ImportLineResult;
  /** Margin % after the import, when it can be computed. */
  marginPercent: number | null;
  /** Updated products: the margin and the purchase price before the import. */
  previousMarginPercent: number | null;
  previousPurchasePriceHT: number | null;
  /** The product's own name (an updated product keeps its name, not the invoice label). */
  productName: string;
}

/** Pairs each result with its line (results carry the index of the lines sent). */
export function pairResults(sent: InvoiceLine[], results: ImportLineResult[], ctx: PricingContext, previews: (LinePreview | null)[]): LineOutcome[] {
  const out: LineOutcome[] = [];
  // A product an earlier line of this import created keeps that line's name (« same product as line N »).
  const createdName = new Map<string, string>();
  for (const r of results) {
    const line = sent[r.index];
    if (!line) continue;
    let marginPercent: number | null = null;
    let previousMarginPercent: number | null = null;
    let previousPurchasePriceHT: number | null = null;
    let productName = r.name || line.name.trim();
    if (r.ok) {
      const purchase = line.purchasePriceHT && line.purchasePriceHT > 0 ? round3(line.purchasePriceHT) : null;
      if (r.action === 'created') {
        marginPercent = purchase && r.sellingPriceTTC > 0 ? marginFor(purchase, line, r.sellingPriceTTC, ctx) : null;
        if (r.productId && !createdName.has(r.productId)) createdName.set(r.productId, productName);
      } else {
        const pv = previews[r.index];
        const local = pv && (pv.target.kind === 'update' || pv.target.kind === 'decide') && pv.target.productId === r.productId ? pv : null;
        if (local && (local.target.kind === 'update' || local.target.kind === 'decide')) productName = local.target.name || productName;
        else if (r.productId && createdName.has(r.productId)) productName = createdName.get(r.productId)!;
        else if (pv?.target.kind === 'sameAs') productName = pv.target.name || productName;
        marginPercent = num(r.newMarginPercent) ?? local?.marginPercent ?? null;
        previousMarginPercent =
          num(r.previousMarginPercent) ??
          (local && local.target.kind !== 'create' && local.target.kind !== 'sameAs' ? (local.target.previous?.marginPercent ?? null) : null);
        previousPurchasePriceHT =
          num(r.previousPurchasePriceHT) ??
          (local && local.target.kind !== 'create' && local.target.kind !== 'sameAs' ? (local.target.previous?.purchasePriceHT ?? null) : null);
      }
    }
    out.push({ line, result: r, marginPercent, previousMarginPercent, previousPurchasePriceHT, productName });
  }
  return out;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
