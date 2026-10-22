/**
 * Invoice review model: one editable line per product read on the invoice.
 *
 * The selling price follows the backend's import rule (POST /api/products/import):
 * when it is left empty, it is derived as cost per dose × 4 × (1 + TVA), rounded
 * to 0,10 € (`deriveSellingPriceTTC`), with the same default dose per category.
 * The screen shows that price with « calculé ×4 » so it is never 0 and never a
 * surprise.
 *
 * A line whose name and container match a product the user already tracks is
 * NOT created: the backend only updates that product's purchase price and keeps
 * its selling price. `findExisting` mirrors that match so the review says so
 * (« Déjà suivi ») and shows the margin the product will have after the import.
 */
import {
  DEFAULT_CATEGORIES,
  IMPORT_DEFAULT_COEFFICIENT,
  MarginMode,
  calculateMargin,
  deriveSellingPriceTTC,
  type Category,
  type ImportLineResult,
  type ImportProductLine,
  type InvoiceScanProduct,
  type ProductWithMargin,
} from '@margebar/shared';
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

// ─── Existing products (same name + container → purchase price update only) ─

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
}

export type ExistingIndex = Map<string, ExistingProduct>;

const existingKey = (name: string, containerCl: number) => `${normName(name)}|${containerCl}`;

/** Index of the user's products by (normalised name, container), oldest first like the backend. */
export function indexProducts(products: ProductWithMargin[] | undefined | null): ExistingIndex {
  const map: ExistingIndex = new Map();
  if (!products?.length) return map;
  const sorted = [...products].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const p of sorted) {
    if (!p?.name || !(p.containerVolumeCl > 0)) continue;
    const key = existingKey(p.name, p.containerVolumeCl);
    if (map.has(key)) continue;
    map.set(key, {
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
    });
  }
  return map;
}

export function findExisting(
  line: Pick<InvoiceLine, 'name' | 'containerVolumeCl'>,
  index: ExistingIndex | null | undefined,
  ctx: PricingContext,
): ExistingProduct | null {
  if (!index || !index.size) return null;
  const name = line.name.trim();
  if (!name) return null;
  return index.get(existingKey(name, containerOf(line, ctx))) ?? null;
}

export interface LinePreview {
  /** Selling price TTC per dose after the import. */
  price: number;
  /** True for the ×4 price (new product, no price typed). */
  derived: boolean;
  /** Margin % after the import (null when it cannot be computed yet). */
  marginPercent: number | null;
  /** The line updates this existing product (its selling price is kept). */
  existing: ExistingProduct | null;
}

/** What the product will look like after the import: price, margin, existing match. */
export function previewLine(line: InvoiceLine, ctx: PricingContext, index: ExistingIndex | null | undefined): LinePreview {
  const existing = findExisting(line, index, ctx);
  const purchase = line.purchasePriceHT && line.purchasePriceHT > 0 ? round3(line.purchasePriceHT) : null;
  if (existing) {
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
      derived: false,
      marginPercent: result && Number.isFinite(result.marginPercent) ? result.marginPercent : null,
      existing,
    };
  }
  const { price, derived } = effectivePrice(line, ctx);
  return { price, derived, marginPercent: purchase && price > 0 ? marginFor(purchase, line, price, ctx) : null, existing: null };
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

export function toImportLine(line: InvoiceLine, categories: Category[], supplier: string, existing: ExistingProduct | null): ImportProductLine {
  const known = line.categoryId ? categories.some((c) => c.id === line.categoryId) : false;
  return {
    name: line.name.trim(),
    ...(known ? { categoryId: line.categoryId! } : { category: line.categorySlug }),
    purchasePriceHT: line.purchasePriceHT,
    containerVolumeCl: line.containerVolumeCl,
    // An existing product keeps its selling price: never send one the API would ignore.
    sellingPriceTTC: !existing && line.sellingPriceTTC && line.sellingPriceTTC > 0 ? line.sellingPriceTTC : null,
    alcoholDegree: line.alcoholDegree,
    quantity: line.quantity,
    supplier: supplier.trim() || null,
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
}

/** Pairs each result with its line (results carry the index of the lines sent). */
export function pairResults(
  sent: InvoiceLine[],
  results: ImportLineResult[],
  ctx: PricingContext,
  index: ExistingIndex | null | undefined,
): LineOutcome[] {
  const out: LineOutcome[] = [];
  for (const r of results) {
    const line = sent[r.index];
    if (!line) continue;
    let marginPercent: number | null = null;
    if (r.ok) {
      const pv = previewLine(line, ctx, r.action === 'updated' ? index : null);
      if (r.action === 'created') {
        const purchase = line.purchasePriceHT && line.purchasePriceHT > 0 ? round3(line.purchasePriceHT) : null;
        marginPercent = purchase && r.sellingPriceTTC > 0 ? marginFor(purchase, line, r.sellingPriceTTC, ctx) : pv.marginPercent;
      } else {
        marginPercent = pv.existing ? pv.marginPercent : null;
      }
    }
    out.push({ line, result: r, marginPercent });
  }
  return out;
}
