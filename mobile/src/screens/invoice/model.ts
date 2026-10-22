/**
 * Invoice review model: one editable line per product read on the invoice.
 *
 * The selling price follows the backend's import rule (POST /api/products/import):
 * when it is left empty, it is derived as cost per dose × 4 × (1 + TVA), rounded
 * to 0,10 € (`deriveSellingPriceTTC`), with the same default dose per category.
 * The screen shows that price with « calculé ×4 » so it is never 0 and never a
 * surprise.
 */
import {
  IMPORT_DEFAULT_COEFFICIENT,
  deriveSellingPriceTTC,
  type Category,
  type ImportLineResult,
  type ImportProductLine,
  type InvoiceScanProduct,
} from '@margebar/shared';
import { NBSP, formatEuro, formatNumber, formatVolumeCl } from '../../utils/format';

export type LineField = 'name' | 'category' | 'quantity' | 'container' | 'purchase' | 'selling';
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

// Mirrors backend/src/services/product.service.ts (import).
const DEFAULT_DOSE_BY_SLUG: Record<string, number> = { vins: 12, bieres: 25, softs: 25 };
const UNIT_SOLD_SLUGS = new Set(['bieres', 'softs']);

let seq = 0;
export const newLineId = () => `line-${Date.now().toString(36)}-${(seq++).toString(36)}`;

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
      alcoholDegree: p.alcoholDegree ?? null,
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

/** The price the product will get: the user's, else the ×4 one. */
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

export function validateLine(line: InvoiceLine): LineErrors {
  const e: LineErrors = {};
  const name = line.name.trim();
  if (!name) e.name = 'Indiquez le nom du produit.';
  else if (name.length > 200) e.name = 'Nom trop long (200 caractères maximum).';
  if (!(line.purchasePriceHT && line.purchasePriceHT > 0)) e.purchase = 'Indiquez le prix d’achat HT d’une bouteille ou d’une unité.';
  else if (line.purchasePriceHT > 100000) e.purchase = 'Prix d’achat trop élevé.';
  if (line.containerVolumeCl !== null && !(line.containerVolumeCl > 0 && line.containerVolumeCl <= 100000)) e.container = 'Contenance invalide.';
  if (line.sellingPriceTTC !== null && !(line.sellingPriceTTC > 0 && line.sellingPriceTTC <= 100000)) e.selling = 'Prix de vente invalide.';
  if (line.quantity !== null && !(line.quantity >= 0 && line.quantity <= 1000000)) e.quantity = 'Quantité invalide.';
  return e;
}

export const hasErrors = (e: LineErrors) => Object.keys(e).length > 0;

/** Which field a backend line error is about (to outline it). */
export function errorField(message: string): LineField | null {
  const m = message.toLowerCase();
  if (/prix d.achat/.test(m)) return 'purchase';
  if (/prix de vente/.test(m)) return 'selling';
  if (/nom/.test(m)) return 'name';
  if (/catégorie|categorie/.test(m)) return 'category';
  if (/contenan|contenant|volume|dose/.test(m)) return 'container';
  if (/quantit/.test(m)) return 'quantity';
  return null;
}

export function toImportLine(line: InvoiceLine, categories: Category[], supplier: string): ImportProductLine {
  const known = line.categoryId ? categories.some((c) => c.id === line.categoryId) : false;
  return {
    name: line.name.trim(),
    ...(known ? { categoryId: line.categoryId! } : { category: line.categorySlug }),
    purchasePriceHT: line.purchasePriceHT,
    containerVolumeCl: line.containerVolumeCl,
    sellingPriceTTC: line.sellingPriceTTC && line.sellingPriceTTC > 0 ? line.sellingPriceTTC : null,
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
}

/** Pairs each result with its line (results carry the index of the lines sent). */
export function pairResults(sent: InvoiceLine[], results: ImportLineResult[]): LineOutcome[] {
  const out: LineOutcome[] = [];
  for (const r of results) {
    const line = sent[r.index];
    if (line) out.push({ line, result: r });
  }
  return out;
}

/** « 6,10 € » helper kept here so every price on the screen goes through format.ts. */
export const euro = (n: number | null | undefined) => formatEuro(n ?? NaN);
