import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import {
  calculateMargin,
  deriveSellingPriceTTC,
  IMPORT_DEFAULT_COEFFICIENT,
  MarginMode,
  MarginResult,
  CreateProductInput,
  DEFAULT_SERVING_TYPES,
  ImportLineResult,
  ImportPreviewLine,
  ImportPreviewResult,
  ImportProductsResult,
  ImportResultMatchReason,
} from '@margebar/shared';
import { HttpError } from '../utils/validation';
import { assertServingsFit, ensureServingTypes, lockProduct, replaceServings, resyncPrimary, ServingInput, validateServings } from './productServing.service';
import { aliasNameKey, analyseLine, CatalogIndex, CONTAINER_TOLERANCE_CL, findMatch, lightKey, normaliseSupplier } from './invoiceMatch.service';

type Db = Prisma.TransactionClient | typeof prisma;

const EMPTY_MARGIN: MarginResult = {
  sellingPriceTTC: 0, sellingPriceHT: 0, marginPercent: 0, coefficient: 0, glassesPerContainer: 0,
  costPerDoseHT: 0, marginPerDoseHT: 0, revenuePerContainer: 0, marginPerContainer: 0, colorCode: 'red',
};

type MarginFields = {
  purchasePriceHT: number;
  containerVolumeCl: number;
  doseVolumeCl: number;
  marginMode: string;
  sellingPriceTTC: number | null | undefined;
  targetMarginPercent: number | null | undefined;
  coefficient: number | null | undefined;
  tvaRate: number;
};

function marginInput(p: MarginFields) {
  return {
    purchasePriceHT: p.purchasePriceHT,
    containerVolumeCl: p.containerVolumeCl,
    doseVolumeCl: p.doseVolumeCl,
    marginMode: p.marginMode as MarginMode,
    sellingPriceTTC: p.sellingPriceTTC ?? undefined,
    targetMarginPercent: p.targetMarginPercent ?? undefined,
    coefficient: p.coefficient ?? undefined,
    tvaRate: p.tvaRate,
  };
}

/**
 * Margin of a stored product. Never throws: one inconsistent row must not turn the whole
 * product list (or the admin list) into a 500.
 */
export function computeMarginSafe(p: MarginFields): MarginResult {
  try {
    return calculateMargin(marginInput(p));
  } catch {
    return EMPTY_MARGIN;
  }
}

type HeadlineServing = { sellingPriceTTC: number; servingType: { sortOrder: number; volumeCl: number } | null };

/**
 * Primary service of a product: lowest servingType.sortOrder, then smallest volume (the rule of
 * resyncPrimary), among the priced services that fit in the container. Null without one.
 */
export function primaryServing<S extends HeadlineServing>(servings: S[] | null | undefined, containerVolumeCl: number): S | null {
  const usable = (servings ?? []).filter((s) => s.servingType && s.servingType.volumeCl > 0
    && s.servingType.volumeCl <= containerVolumeCl && s.sellingPriceTTC > 0);
  usable.sort((a, b) => a.servingType!.sortOrder - b.servingType!.sortOrder || a.servingType!.volumeCl - b.servingType!.volumeCl);
  return usable[0] ?? null;
}

/**
 * Headline price fields as the API reports them. A product with services is priced by its
 * primary service (contract: sellingPriceTTC, doseVolumeCl and marginMode follow it). Rows saved
 * by older versions (whose PUT /servings never synced them) can still hold another price until
 * the next save: read-time, the primary service wins, so the list pill, the detail and the
 * dashboard never show a margin computed from a different price. Nothing is written.
 */
export function withHeadline<T extends MarginFields & { servings?: HeadlineServing[] | null }>(product: T): T {
  const primary = primaryServing(product.servings, product.containerVolumeCl);
  if (!primary) return product;
  return {
    ...product,
    marginMode: MarginMode.FIX_SELLING_PRICE,
    sellingPriceTTC: primary.sellingPriceTTC,
    doseVolumeCl: primary.servingType!.volumeCl,
  };
}

/** Margin of a product as shown everywhere (primary service first, see withHeadline). */
export function productMargin(product: MarginFields & { servings?: HeadlineServing[] | null }): MarginResult {
  return computeMarginSafe(withHeadline(product));
}

function enrichProduct<T extends MarginFields & { servings?: HeadlineServing[] | null }>(product: T): T & { computed: MarginResult } {
  const headline = withHeadline(product);
  return { ...headline, computed: computeMarginSafe(headline) };
}

const fmtCl = (n: number) => `${String(Math.round(n * 100) / 100).replace('.', ',')} cl`;

/**
 * Throws a readable 400 when the margin-mode fields are inconsistent — checked BEFORE any write.
 * `doseField` names the field reported in `details` for a dose problem (a primary serving's dose
 * comes from `servings`, not from `doseVolumeCl`).
 */
export function assertMarginInputs(p: MarginFields, doseField = 'doseVolumeCl'): void {
  // A dose bigger than the bottle gives a meaningless (negative) margin: refused on every path
  // (create, update, primary serving, import).
  if (p.doseVolumeCl > p.containerVolumeCl) {
    throw new HttpError(400, `La dose servie (${fmtCl(p.doseVolumeCl)}) ne peut pas dépasser la contenance (${fmtCl(p.containerVolumeCl)}).`, { field: doseField });
  }
  switch (p.marginMode) {
    case MarginMode.FIX_SELLING_PRICE:
      if (!(typeof p.sellingPriceTTC === 'number' && p.sellingPriceTTC > 0)) {
        throw new HttpError(400, 'Indiquez un prix de vente TTC supérieur à 0 €.', { field: 'sellingPriceTTC' });
      }
      break;
    case MarginMode.FIX_TARGET_MARGIN:
      if (!(typeof p.targetMarginPercent === 'number' && p.targetMarginPercent >= 0 && p.targetMarginPercent < 100)) {
        throw new HttpError(400, 'Indiquez une marge cible comprise entre 0 et 99,9 %.', { field: 'targetMarginPercent' });
      }
      break;
    case MarginMode.FIX_COEFFICIENT:
      if (!(typeof p.coefficient === 'number' && p.coefficient > 0)) {
        throw new HttpError(400, 'Indiquez un coefficient supérieur à 0.', { field: 'coefficient' });
      }
      break;
    default:
      throw new HttpError(400, 'Mode de calcul inconnu.', { field: 'marginMode' });
  }
  try {
    calculateMargin(marginInput(p));
  } catch {
    throw new HttpError(400, 'Les prix et volumes saisis ne permettent pas de calculer la marge. Vérifiez la contenance et la dose.', { field: doseField });
  }
}

/** The category must be a built-in one (userId null) or one of the user's own categories. */
async function assertCategory(categoryId: string, userId: string): Promise<void> {
  const cat = await prisma.category.findFirst({
    where: { id: categoryId, OR: [{ userId: null }, { userId }] },
    select: { id: true },
  });
  if (!cat) throw new HttpError(400, 'Catégorie inconnue : choisissez une catégorie dans la liste.', { field: 'categoryId' });
}

const servingsInclude = {
  include: { servingType: true },
  orderBy: [{ servingType: { sortOrder: 'asc' } }, { servingType: { volumeCl: 'asc' } }],
} satisfies Prisma.Product$servingsArgs;

/** Every column except the heavy `imageUrl` (lists stay small: thumbnails only). */
const LIST_SELECT = {
  id: true,
  userId: true,
  categoryId: true,
  name: true,
  purchasePriceHT: true,
  containerVolumeCl: true,
  doseVolumeCl: true,
  marginMode: true,
  sellingPriceTTC: true,
  targetMarginPercent: true,
  coefficient: true,
  tvaRate: true,
  alcoholDegree: true,
  supplier: true,
  thumbnailUrl: true,
  priceToReview: true,
  createdAt: true,
  updatedAt: true,
  category: true,
  servings: servingsInclude,
} satisfies Prisma.ProductSelect;

/**
 * A stored photo the app can display: a data URI or an https URL (what POST/PUT accept).
 * Anything else (legacy blob:/file:/http: values) is reported as « no photo » so the product
 * page offers « Ajouter une photo » instead of an empty photo card. Migration 0006 clears them.
 */
const USABLE_IMAGE_WHERE: Prisma.ProductWhereInput[] = [
  { imageUrl: { startsWith: 'data:image/' } },
  { imageUrl: { startsWith: 'https://' } },
];
const usableImage = (url: string | null | undefined): string | null =>
  url && (url.startsWith('data:image/') || url.startsWith('https://')) ? url : null;

/** Products as the list returns them (thumbnailUrl + hasImage, never imageUrl), most recently updated first. */
export async function listProducts(where: Prisma.ProductWhereInput, db: Db = prisma) {
  const list = () => db.product.findMany({ where, select: LIST_SELECT, orderBy: { updatedAt: 'desc' } });
  const images = () => db.product.findMany({ where: { ...where, OR: USABLE_IMAGE_WHERE }, select: { id: true } });
  // Inside a transaction (one connection) the two reads run one after the other.
  const [products, withImage] = db === prisma ? await Promise.all([list(), images()]) : [await list(), await images()];
  const hasImage = new Set(withImage.map((p) => p.id));
  return products.map((p) => ({ ...enrichProduct(p), hasImage: hasImage.has(p.id) }));
}

/** GET /api/products — thumbnailUrl + hasImage, never imageUrl. */
export async function getProducts(userId: string, categoryId?: string) {
  const where: Prisma.ProductWhereInput = { userId };
  if (categoryId) where.categoryId = categoryId;
  return listProducts(where);
}

/** GET /api/products/:id — includes imageUrl and thumbnailUrl. */
export async function getProduct(id: string, userId: string) {
  const product = await prisma.product.findFirst({
    where: { id, userId },
    include: { category: true, servings: servingsInclude },
  });
  if (!product) throw new Error('Produit non trouvé');
  const imageUrl = usableImage(product.imageUrl);
  return { ...enrichProduct(product), imageUrl, hasImage: !!imageUrl };
}

export type ProductWrite = Partial<CreateProductInput> & { servings?: ServingInput[] };

export async function createProduct(userId: string, data: CreateProductInput & { servings?: ServingInput[] }) {
  const sellingPriceTTC = data.sellingPriceTTC && data.sellingPriceTTC > 0 ? data.sellingPriceTTC : null;
  const fields = {
    purchasePriceHT: data.purchasePriceHT,
    containerVolumeCl: data.containerVolumeCl,
    doseVolumeCl: data.doseVolumeCl,
    marginMode: data.marginMode,
    sellingPriceTTC,
    targetMarginPercent: data.targetMarginPercent ?? null,
    coefficient: data.coefficient ?? null,
    tvaRate: data.tvaRate,
  };
  // Validate everything first: a failure must never leave a half-created product behind.
  await assertCategory(data.categoryId, userId);
  const servings = data.servings ? await validateServings(userId, data.servings, { containerVolumeCl: data.containerVolumeCl }) : null;
  if (servings?.length) {
    // The primary serving sets the headline price: validate with it.
    assertMarginInputs({ ...fields, marginMode: MarginMode.FIX_SELLING_PRICE, sellingPriceTTC: servings[0].sellingPriceTTC, doseVolumeCl: servings[0].volumeCl }, 'servings');
  } else {
    assertMarginInputs(fields);
  }

  const id = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        userId,
        categoryId: data.categoryId,
        name: data.name,
        ...fields,
        alcoholDegree: data.alcoholDegree ?? 0,
        supplier: data.supplier || null,
        imageUrl: data.imageUrl ?? null,
        thumbnailUrl: data.thumbnailUrl ?? null,
      },
      select: { id: true },
    });
    if (servings) await replaceServings(tx, created.id, servings);
    return created.id;
  });

  return getProduct(id, userId);
}

/** Fields of a PUT that set the selling price (they clear priceToReview). */
const PRICING_FIELDS = ['sellingPriceTTC', 'marginMode', 'targetMarginPercent', 'coefficient'] as const;

/** Headline fields a PUT may send that are overwritten by the primary serving (see ProductWithMargin.ignoredFields). */
const SYNCED_FIELDS = ['sellingPriceTTC', 'doseVolumeCl', 'marginMode'] as const;
type SyncedField = (typeof SYNCED_FIELDS)[number];

export async function updateProduct(id: string, userId: string, data: ProductWrite) {
  const existing = await prisma.product.findFirst({ where: { id, userId } });
  if (!existing) throw new Error('Produit non trouvé');

  const { servings: servingsInput, ...rest } = data;
  const merged = {
    purchasePriceHT: rest.purchasePriceHT ?? existing.purchasePriceHT,
    containerVolumeCl: rest.containerVolumeCl ?? existing.containerVolumeCl,
    doseVolumeCl: rest.doseVolumeCl ?? existing.doseVolumeCl,
    marginMode: rest.marginMode ?? existing.marginMode,
    sellingPriceTTC: rest.sellingPriceTTC === undefined ? existing.sellingPriceTTC : rest.sellingPriceTTC,
    targetMarginPercent: rest.targetMarginPercent === undefined ? existing.targetMarginPercent : rest.targetMarginPercent,
    coefficient: rest.coefficient === undefined ? existing.coefficient : rest.coefficient,
    tvaRate: rest.tvaRate ?? existing.tvaRate,
  };
  if (rest.categoryId && rest.categoryId !== existing.categoryId) await assertCategory(rest.categoryId, userId);
  const servings = servingsInput
    ? await validateServings(userId, servingsInput, { containerVolumeCl: merged.containerVolumeCl })
    : null;
  // Without `servings` in the body, a product that has servings keeps its headline price/dose
  // synced to its primary serving (contract §3): validate against that serving, not the body.
  let primary: { sellingPriceTTC: number; volumeCl: number } | null = null;
  if (servings) {
    primary = servings[0] ?? null;
  } else {
    const current = await currentServings(id);
    // A smaller container must still hold every serving the product already has.
    if (rest.containerVolumeCl !== undefined) assertServingsFit(current, merged.containerVolumeCl, 'containerVolumeCl');
    primary = current[0] ?? null;
  }
  // « À vérifier » (derived import price) ends when the owner sets the price: a pricing field sent
  // counts — the same price included, it confirms it — but only when it applies, i.e. when the product
  // has no service after this PUT (with services, the primary service sets the price and the field is
  // ignored). A non-empty `servings` clears it too (replaceServings).
  const pricingApplies = !primary && PRICING_FIELDS.some((f) => rest[f] !== undefined);
  if (primary) {
    assertMarginInputs({ ...merged, marginMode: MarginMode.FIX_SELLING_PRICE, sellingPriceTTC: primary.sellingPriceTTC, doseVolumeCl: primary.volumeCl }, servings ? 'servings' : 'containerVolumeCl');
  } else {
    assertMarginInputs(merged);
  }

  // Prisma semantics match the API contract: undefined = unchanged, null = cleared.
  const update: Prisma.ProductUncheckedUpdateInput = {
    name: rest.name,
    categoryId: rest.categoryId,
    purchasePriceHT: rest.purchasePriceHT,
    containerVolumeCl: rest.containerVolumeCl,
    doseVolumeCl: rest.doseVolumeCl,
    marginMode: rest.marginMode,
    sellingPriceTTC: rest.sellingPriceTTC === undefined ? undefined : (rest.sellingPriceTTC && rest.sellingPriceTTC > 0 ? rest.sellingPriceTTC : null),
    targetMarginPercent: rest.targetMarginPercent,
    coefficient: rest.coefficient,
    tvaRate: rest.tvaRate,
    // Non-null column: null (= "cleared") is stored as 0, like on create.
    alcoholDegree: rest.alcoholDegree === null ? 0 : rest.alcoholDegree,
    supplier: rest.supplier === undefined ? undefined : (rest.supplier || null),
    imageUrl: rest.imageUrl,
    // A new photo sent without its thumbnail must not keep the previous photo's thumbnail.
    thumbnailUrl: rest.thumbnailUrl !== undefined
      ? rest.thumbnailUrl
      : (rest.imageUrl !== undefined && rest.imageUrl !== existing.imageUrl ? null : undefined),
    priceToReview: pricingApplies ? false : undefined,
  };

  await prisma.$transaction(async (tx) => {
    await lockProduct(tx, id);
    // Track price history
    if (rest.purchasePriceHT !== undefined && rest.purchasePriceHT !== existing.purchasePriceHT) {
      await tx.priceHistory.create({
        data: { productId: id, oldPrice: existing.purchasePriceHT, newPrice: rest.purchasePriceHT, source: 'manual' },
      });
    }
    await tx.product.update({ where: { id }, data: update });
    if (servings) await replaceServings(tx, id, servings);
    else await resyncPrimary(tx, id); // no-op when the product has no servings
  });

  const product = await getProduct(id, userId);
  // Tell the client which headline fields it sent were replaced by the primary serving's values
  // (a product with services is priced by its services: send `servings` to change the price).
  const ignoredFields: SyncedField[] = product.servings.length
    ? SYNCED_FIELDS.filter((f) => rest[f] !== undefined && rest[f] !== null && rest[f] !== product[f])
    : [];
  return ignoredFields.length ? { ...product, ignoredFields } : product;
}

/** Current servings of a product with their volume, primary first (lowest sortOrder, then smallest volume). */
async function currentServings(productId: string): Promise<{ name: string; sellingPriceTTC: number; volumeCl: number }[]> {
  const rows = await prisma.productServing.findMany({ where: { productId }, include: { servingType: true } });
  rows.sort((a, b) => a.servingType.sortOrder - b.servingType.sortOrder || a.servingType.volumeCl - b.servingType.volumeCl);
  return rows.map((r) => ({ name: r.servingType.name, sellingPriceTTC: r.sellingPriceTTC, volumeCl: r.servingType.volumeCl }));
}

export async function getPriceHistory(productId: string, userId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, userId }, select: { id: true } });
  if (!product) throw new Error('Produit non trouvé');

  return prisma.priceHistory.findMany({
    where: { productId },
    orderBy: { changedAt: 'desc' },
  });
}

export async function deleteProduct(id: string, userId: string) {
  const existing = await prisma.product.findFirst({ where: { id, userId }, select: { id: true } });
  if (!existing) throw new Error('Produit non trouvé');
  await prisma.product.delete({ where: { id } });
}


// ---------------------------------------------------------------------------
// Invoice import — POST /api/products/import and POST /api/products/import/preview
// ---------------------------------------------------------------------------

/** Default dose (cl) per category when the invoice line has none. */
const DEFAULT_DOSE_BY_SLUG: Record<string, number> = {
  vins: 12,
  bieres: 25,
  softs: 25,
};

/** Categories whose small containers (can, bottle ≤ 50 cl) are served whole. */
const UNIT_SOLD_SLUGS = new Set(['bieres', 'softs']);

/**
 * Products created by `createNew` lines in the last 2 minutes, per user + name + container.
 * A replay of the same line (double tap, client retry after a timeout, the same product twice on
 * one invoice) updates that product instead of creating it a second time. Only products created
 * by a `createNew` line are remembered: a product created by hand never turns a forced creation
 * into an update. Per process (one instance); a stale entry is ignored when its product is gone.
 */
const CREATE_NEW_REPLAY_MS = 2 * 60 * 1000;
const createNewReplay = new Map<string, { productId: string; at: number }>();
const replayKey = (userId: string, name: string, containerVolumeCl: number) => `${userId}|${lightKey(name)}|${Math.round(containerVolumeCl * 100) / 100}`;
function recentCreateNew(key: string): string | null {
  const now = Date.now();
  if (createNewReplay.size > 2000) for (const [k, v] of createNewReplay) if (now - v.at > CREATE_NEW_REPLAY_MS) createNewReplay.delete(k);
  const hit = createNewReplay.get(key);
  return hit && now - hit.at <= CREATE_NEW_REPLAY_MS ? hit.productId : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
/** Let other requests run (the matching of an invoice is CPU work on the only Node process). */
const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Lines between two yields of the preview and the import. */
const YIELD_EVERY_LINES = 10;
/** Longest a preview may run: past it, it answers 503 (retryable) instead of holding the server. */
export const PREVIEW_TIME_BUDGET_MS = 5_000;

export interface NormalizedImportLine {
  name: string;
  categoryId?: string | null;
  category?: string | null;
  purchasePriceHT?: number | null;
  containerVolumeCl?: number | null;
  doseVolumeCl?: number | null;
  sellingPriceTTC?: number | null;
  tvaRate?: number | null;
  alcoholDegree?: number | null;
  supplier?: string | null;
  productId?: string | null;
  createNew?: boolean | null;
}

export type ParsedImportLine = { index: number; line: NormalizedImportLine | null; error?: string; rawName: string };

/** What matching and the margins need from a product (headline = primary service, see withHeadline). */
const MATCH_SELECT = {
  id: true,
  name: true,
  createdAt: true,
  purchasePriceHT: true,
  containerVolumeCl: true,
  doseVolumeCl: true,
  marginMode: true,
  sellingPriceTTC: true,
  targetMarginPercent: true,
  coefficient: true,
  tvaRate: true,
  servings: { select: { sellingPriceTTC: true, servingType: { select: { name: true, sortOrder: true, volumeCl: true } } } },
} satisfies Prisma.ProductSelect;
type MatchProduct = Prisma.ProductGetPayload<{ select: typeof MATCH_SELECT }>;
/** Oldest first (ties by id): the matcher breaks ties on this order, so preview and import agree. */
const MATCH_ORDER: Prisma.ProductOrderByWithRelationInput[] = [{ createdAt: 'asc' }, { id: 'asc' }];

/** Container (cl) an import line is read with: its own, else the user's default (70 cl). */
function lineContainer(line: NormalizedImportLine, userContainer: number): number {
  return line.containerVolumeCl && line.containerVolumeCl > 0 ? line.containerVolumeCl : userContainer;
}

type CategoryRow = { id: string; slug: string; userId: string | null };
type ServingTypeLite = { id: string; name: string; volumeCl: number; sortOrder: number };

/** What every line of one import (or preview) needs: the user's defaults, categories and services. */
interface ImportContext {
  tva: number;
  container: number;
  bySlug: Map<string, CategoryRow>;
  byCategoryId: Map<string, CategoryRow>;
  fallbackCat: CategoryRow | undefined;
  servingTypes: ServingTypeLite[];
}

/**
 * Load the import context. The import creates the default services of a new account (its products get
 * the service matching their dose); the preview writes nothing and reads the defaults instead.
 */
async function loadImportContext(userId: string, mode: 'import' | 'preview'): Promise<ImportContext> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'Utilisateur non trouvé');
  // Built-in categories first (slug lookups must resolve to them), then the user's own ones.
  const categories = await prisma.category.findMany({
    where: { OR: [{ userId: null }, { userId }] },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, slug: true, userId: true },
  });
  const bySlug = new Map<string, CategoryRow>();
  for (const c of [...categories].sort((a, b) => Number(a.userId !== null) - Number(b.userId !== null))) {
    if (!bySlug.has(c.slug)) bySlug.set(c.slug, c);
  }
  let servingTypes: ServingTypeLite[];
  if (mode === 'import') {
    servingTypes = await ensureServingTypes(userId);
  } else {
    servingTypes = await prisma.servingType.findMany({ where: { userId }, orderBy: { sortOrder: 'asc' } });
    if (!servingTypes.length) servingTypes = DEFAULT_SERVING_TYPES.map((t, i) => ({ id: `default:${i}`, name: t.name, volumeCl: t.volumeCl, sortOrder: t.sortOrder }));
  }
  return {
    tva: user.isAutoEntrepreneur ? 0 : user.defaultTvaRate,
    container: user.defaultContainerVolumeCl > 0 ? user.defaultContainerVolumeCl : 70,
    bySlug,
    byCategoryId: new Map(categories.map((c) => [c.id, c])),
    fallbackCat: bySlug.get('spiritueux') ?? categories[0],
    servingTypes,
  };
}

/** Category of a line (its id, else its slug, else « spiritueux »). Throws for an unknown id. */
function lineCategory(line: NormalizedImportLine, ctx: ImportContext): CategoryRow {
  let cat = ctx.fallbackCat;
  if (line.categoryId) {
    const c = ctx.byCategoryId.get(line.categoryId);
    if (!c) throw new HttpError(400, 'Catégorie inconnue.', { field: 'categoryId' });
    cat = c;
  } else if (line.category) {
    cat = ctx.bySlug.get(line.category) ?? ctx.fallbackCat;
  }
  if (!cat) throw new HttpError(500, 'Aucune catégorie disponible.');
  return cat;
}

/** Purchase price HT an import line carries (0 = none). */
const linePurchase = (line: NormalizedImportLine) => (line.purchasePriceHT && line.purchasePriceHT > 0 ? round3(line.purchasePriceHT) : 0);

interface CreationPlan {
  fields: MarginFields & { marginMode: string; sellingPriceTTC: number; targetMarginPercent: null; coefficient: null };
  priceDerived: boolean;
  serving: ServingTypeLite | undefined;
}

/**
 * The product an unmatched line creates. Selling price missing/≤ 0 → derived with coefficient 4,
 * rounded to 0,10 € (never 0). Beers/softs in a can or bottle (≤ 50 cl) are sold as the whole unit.
 * Throws a readable HttpError when the product cannot be created.
 */
function planCreation(line: NormalizedImportLine, cat: CategoryRow, ctx: ImportContext): CreationPlan {
  const purchasePriceHT = linePurchase(line);
  const containerVolumeCl = lineContainer(line, ctx.container);
  const soldByUnit = UNIT_SOLD_SLUGS.has(cat.slug) && containerVolumeCl <= 50;
  const doseRaw = line.doseVolumeCl && line.doseVolumeCl > 0
    ? line.doseVolumeCl
    : (soldByUnit ? containerVolumeCl : (DEFAULT_DOSE_BY_SLUG[cat.slug] ?? 5));
  const doseVolumeCl = Math.min(doseRaw, containerVolumeCl);
  const tvaRate = typeof line.tvaRate === 'number' && line.tvaRate >= 0 && line.tvaRate < 1 ? line.tvaRate : ctx.tva;
  let sellingPriceTTC = line.sellingPriceTTC && line.sellingPriceTTC > 0 ? round2(line.sellingPriceTTC) : 0;
  let priceDerived = false;
  if (!(sellingPriceTTC > 0)) {
    sellingPriceTTC = deriveSellingPriceTTC(purchasePriceHT, containerVolumeCl, doseVolumeCl, tvaRate, IMPORT_DEFAULT_COEFFICIENT);
    priceDerived = true;
  }
  if (!(sellingPriceTTC > 0)) {
    throw new HttpError(400, 'Prix d’achat manquant : impossible de calculer un prix de vente. Indiquez le prix d’achat HT ou un prix de vente.', { field: 'purchasePriceHT' });
  }
  const fields = {
    purchasePriceHT, containerVolumeCl, doseVolumeCl,
    marginMode: MarginMode.FIX_SELLING_PRICE as string,
    sellingPriceTTC, targetMarginPercent: null, coefficient: null, tvaRate,
  };
  assertMarginInputs(fields);
  const serving = ctx.servingTypes
    .filter((st) => Math.abs(st.volumeCl - doseVolumeCl) < 0.01)
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];
  return { fields, priceDerived, serving };
}

/** Margin and selling price of a matched product as the app shows them (primary service first). */
function shownPricing(p: MatchProduct) {
  const headline = withHeadline(p);
  const computed = computeMarginSafe(headline);
  const primary = primaryServing(p.servings, p.containerVolumeCl);
  return {
    sellingPriceTTC: computed.sellingPriceTTC > 0 ? round2(computed.sellingPriceTTC) : (headline.sellingPriceTTC ?? null),
    marginPercent: round2(computed.marginPercent),
    servingName: primary?.servingType?.name ?? null,
  };
}

/**
 * Whether a link is remembered for the supplier's next invoice. A 'fuzzy' match is only a guess:
 * it is remembered once the user confirms it (the line then carries its `productId`: 'manual').
 */
const remembersAlias = (reason: ImportResultMatchReason | null) => reason !== 'fuzzy';

/** Remember « this supplier's label → this product » (next invoice: match 'alias'). */
async function rememberAlias(tx: Prisma.TransactionClient, userId: string, supplierKey: string, nameKey: string | null, productId: string) {
  if (!supplierKey || !nameKey) return;
  await tx.invoiceAlias.upsert({
    where: { userId_supplierKey_nameKey: { userId, supplierKey, nameKey } },
    create: { userId, supplierKey, nameKey, productId },
    update: { productId },
  });
}

/**
 * Import invoice lines one by one. Each line is validated before anything is written and is
 * committed in its own transaction, so one bad line never fails the batch.
 * - `productId` → that product's purchase price is updated ('manual'); `createNew` → always a new product;
 * - otherwise the line is matched like the preview: exact name, then the supplier's remembered
 *   label (alias), then — only with `options.autoLinkFuzzy` — a similar name with the same
 *   container (fuzzy, see invoiceMatch.service); without it a look-alike line creates a product;
 *   a matched product only gets its purchase price updated (history 'invoice');
 * - every linked or created line from a known supplier is remembered for the next invoice
 *   (InvoiceAlias), except a 'fuzzy' match the user did not confirm;
 * - no match: a product is created (see planCreation), flagged `priceToReview` when its price was derived;
 * - the primary serving matching the dose is created when the user has one.
 */
export async function importProducts(
  userId: string,
  supplier: string | null | undefined,
  lines: ParsedImportLine[],
  options: { autoLinkFuzzy?: boolean } = {},
): Promise<ImportProductsResult> {
  const ctx = await loadImportContext(userId, 'import');

  const results: ImportLineResult[] = [];
  for (let k = 0; k < lines.length; k++) {
    if (k && k % YIELD_EVERY_LINES === 0) await yieldToEventLoop();
    const { index, line, error, rawName } = lines[k];
    if (!line) {
      results.push({ index, ok: false, name: rawName, error: error || 'Ligne invalide.' });
      continue;
    }
    try {
      const cat = lineCategory(line, ctx);
      const purchasePriceHT = linePurchase(line);
      const containerVolumeCl = lineContainer(line, ctx.container);
      const lineSupplier = (line.supplier || supplier || '').trim().slice(0, 200) || null;
      const supplierKey = normaliseSupplier(lineSupplier);
      const nameKey = aliasNameKey(line.name, containerVolumeCl);

      const outcome = await prisma.$transaction(async (tx) => {
        // One import line at a time per user: two concurrent imports of the same lines (double
        // tap, client retry after a timeout) wait here, and the second one finds what the first
        // one created or linked instead of duplicating it.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`import|${userId}`}))`;

        let targetId: string | null = null;
        let matchReason: ImportResultMatchReason | null = null;
        if (line.productId) {
          targetId = line.productId;
          matchReason = 'manual';
        } else if (line.createNew) {
          // Forced creation, but a replay of the same line must not create it twice.
          targetId = recentCreateNew(replayKey(userId, line.name, containerVolumeCl));
          if (targetId) matchReason = 'exact';
        } else {
          const near = await tx.product.findMany({
            where: { userId, containerVolumeCl: { gte: containerVolumeCl - CONTAINER_TOLERANCE_CL, lte: containerVolumeCl + CONTAINER_TOLERANCE_CL } },
            select: { id: true, name: true, containerVolumeCl: true, createdAt: true },
            orderBy: MATCH_ORDER,
          });
          const alias = supplierKey && nameKey
            ? await tx.invoiceAlias.findUnique({
              where: { userId_supplierKey_nameKey: { userId, supplierKey, nameKey } },
              select: { product: { select: { id: true, name: true, containerVolumeCl: true, createdAt: true } } },
            })
            : null;
          const found = findMatch({ name: line.name, containerVolumeCl }, near, alias?.product ?? null);
          // A 'fuzzy' look-alike is a guess: link it only when the client opted in (it showed the
          // match to the user); otherwise the line creates a product, as the review screen showed.
          if (found && (found.reason !== 'fuzzy' || options.autoLinkFuzzy)) {
            targetId = found.product.id;
            matchReason = found.reason;
          }
        }

        // Lock the matched product, then read it: a price batch or a PUT committed meanwhile is
        // seen, so the history row and the « before » figures start from its current price.
        let target: MatchProduct | null = null;
        if (targetId) {
          await lockProduct(tx, targetId);
          target = await tx.product.findFirst({ where: { id: targetId, userId }, select: MATCH_SELECT });
          if (!target && line.productId) {
            throw new HttpError(400, 'Le produit à mettre à jour est introuvable (supprimé ou d’un autre compte). Rechargez puis réessayez.', { field: 'productId' });
          }
          if (!target) matchReason = null; // deleted meanwhile: the line creates a product
        }

        // Linked to an existing product: update the purchase price only.
        if (target) {
          const before = shownPricing(target);
          const newPurchase = purchasePriceHT > 0 ? purchasePriceHT : target.purchasePriceHT;
          if (newPurchase !== target.purchasePriceHT) {
            await tx.priceHistory.create({ data: { productId: target.id, oldPrice: target.purchasePriceHT, newPrice: newPurchase, source: 'invoice' } });
            await tx.product.update({ where: { id: target.id }, data: { purchasePriceHT: newPurchase, ...(lineSupplier ? { supplier: lineSupplier } : {}) } });
          }
          if (remembersAlias(matchReason)) await rememberAlias(tx, userId, supplierKey, nameKey, target.id);
          const after = shownPricing({ ...target, purchasePriceHT: newPurchase });
          return {
            action: 'updated' as const,
            productId: target.id,
            sellingPriceTTC: after.sellingPriceTTC ?? 0,
            priceDerived: false,
            previousPurchasePriceHT: target.purchasePriceHT,
            previousMarginPercent: before.marginPercent,
            newMarginPercent: after.marginPercent,
            matchReason,
          };
        }

        // Throwing here rolls the (still empty) transaction back: nothing is written for this line.
        const { fields, priceDerived, serving } = planCreation(line, cat, ctx);
        const created = await tx.product.create({
          data: {
            userId,
            categoryId: cat.id,
            name: line.name,
            ...fields,
            alcoholDegree: line.alcoholDegree && line.alcoholDegree > 0 ? line.alcoholDegree : 0,
            supplier: lineSupplier,
            // A price computed ×4 is a guess: « À vérifier » until the owner sets it.
            priceToReview: priceDerived,
          },
          select: { id: true },
        });
        if (serving) {
          await tx.productServing.create({ data: { productId: created.id, servingTypeId: serving.id, sellingPriceTTC: fields.sellingPriceTTC } });
        }
        await rememberAlias(tx, userId, supplierKey, nameKey, created.id);
        // Set before the commit (the per-user lock is released at commit): a replay waiting on
        // the lock always sees it. If this transaction rolls back, the entry points to nothing and is ignored.
        if (line.createNew) createNewReplay.set(replayKey(userId, line.name, containerVolumeCl), { productId: created.id, at: Date.now() });
        return {
          action: 'created' as const,
          productId: created.id,
          sellingPriceTTC: fields.sellingPriceTTC,
          priceDerived,
          previousPurchasePriceHT: null,
          previousMarginPercent: null,
          newMarginPercent: null,
          matchReason: null,
        };
      }, { maxWait: 10_000, timeout: 20_000 });
      results.push({ index, ok: true, name: line.name, ...outcome });
    } catch (err: any) {
      const message = err instanceof HttpError ? err.message : 'Erreur serveur lors de l’enregistrement de cette ligne.';
      if (!(err instanceof HttpError)) console.error(`[IMPORT] line ${index} failed:`, err?.message ?? err);
      results.push({ index, ok: false, name: line.name, error: message });
    }
  }

  const createdCount = results.filter((r) => r.ok && r.action === 'created').length;
  const updatedCount = results.filter((r) => r.ok && r.action === 'updated').length;
  const failedCount = results.filter((r) => !r.ok).length;
  return { createdCount, updatedCount, failedCount, results };
}

/** A product of the preview: a real one, or one an earlier line of the same invoice would create. */
type PreviewProduct = MatchProduct & { sameAsLine?: number };

/**
 * POST /api/products/import/preview — what POST /import would do with each line, without writing
 * anything: the automatic match (exact, alias, fuzzy), up to 3 look-alike candidates and the matched
 * product's current price and margin. `productId` / `createNew` on a line are ignored here.
 *
 * The lines are read in order, as /import writes them: a line that would create a product makes
 * that product visible to the next lines (their match carries `sameAsLine` and a null productId),
 * a matched line's purchase price is the next lines' « previous » one, and the links /import would
 * remember for the supplier apply to the next lines.
 */
export async function previewImport(
  userId: string,
  supplier: string | null | undefined,
  lines: ParsedImportLine[],
): Promise<ImportPreviewResult> {
  const started = Date.now();
  const ctx = await loadImportContext(userId, 'preview');
  const products: PreviewProduct[] = await prisma.product.findMany({ where: { userId }, select: MATCH_SELECT, orderBy: MATCH_ORDER });
  const index = new CatalogIndex<PreviewProduct>(products);
  const byProductId = new Map(products.map((p) => [p.id, p]));

  const supplierKeyOf = (line: NormalizedImportLine) => normaliseSupplier((line.supplier || supplier || '').trim().slice(0, 200));
  const supplierKeys = [...new Set(lines.flatMap(({ line }) => (line ? [supplierKeyOf(line)] : [])).filter(Boolean))];
  const aliases = supplierKeys.length
    ? await prisma.invoiceAlias.findMany({ where: { userId, supplierKey: { in: supplierKeys } }, select: { supplierKey: true, nameKey: true, productId: true } })
    : [];
  const aliasOf = new Map(aliases.map((a) => [`${a.supplierKey}\u0000${a.nameKey}`, a.productId]));
  /** Purchase price of a product after the lines already read (they update it). */
  const purchaseNow = new Map<string, number>();
  const isReal = (p: PreviewProduct) => p.sameAsLine === undefined;

  const out: ImportPreviewLine[] = [];
  for (let k = 0; k < lines.length; k++) {
    if (k && k % YIELD_EVERY_LINES === 0) {
      await yieldToEventLoop();
      if (Date.now() - started > PREVIEW_TIME_BUDGET_MS) {
        throw new HttpError(503, 'L’analyse de la facture prend trop de temps. Réessayez dans un instant, ou avec moins de lignes.', { code: 'busy', retryable: true });
      }
    }
    const { index: lineIndex, line, error } = lines[k];
    if (!line) {
      out.push({ index: lineIndex, match: null, candidates: [], previous: null, error: error || 'Ligne invalide.' });
      continue;
    }
    let cat: CategoryRow;
    try {
      cat = lineCategory(line, ctx);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      out.push({ index: lineIndex, match: null, candidates: [], previous: null, error: err.message });
      continue;
    }
    const containerVolumeCl = lineContainer(line, ctx.container);
    const supplierKey = supplierKeyOf(line);
    const nameKey = aliasNameKey(line.name, containerVolumeCl);
    const aliasKey = supplierKey && nameKey ? `${supplierKey}\u0000${nameKey}` : null;
    const aliasId = aliasKey ? aliasOf.get(aliasKey) : undefined;
    const { match: found, candidates } = analyseLine({ name: line.name, containerVolumeCl }, index, {
      alias: aliasId ? byProductId.get(aliasId) ?? null : null,
      candidates: 3,
      candidateFilter: isReal,
    });

    if (found) {
      const p = found.product;
      const purchaseBefore = purchaseNow.get(p.id) ?? p.purchasePriceHT;
      const shown = shownPricing({ ...p, purchasePriceHT: purchaseBefore });
      const purchase = linePurchase(line);
      purchaseNow.set(p.id, purchase > 0 ? purchase : purchaseBefore);
      if (aliasKey && remembersAlias(found.reason)) aliasOf.set(aliasKey, p.id);
      out.push({
        index: lineIndex,
        match: {
          productId: isReal(p) ? p.id : null,
          name: p.name,
          containerVolumeCl: p.containerVolumeCl,
          score: found.score,
          reason: found.reason,
          ...(isReal(p) ? {} : { sameAsLine: p.sameAsLine }),
        },
        candidates,
        previous: { purchasePriceHT: purchaseBefore, sellingPriceTTC: shown.sellingPriceTTC, marginPercent: shown.marginPercent, servingName: shown.servingName },
      });
      continue;
    }

    // /import would create a product: it fails the same way, or later lines can match it.
    let plan: CreationPlan;
    try {
      plan = planCreation(line, cat, ctx);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      out.push({ index: lineIndex, match: null, candidates, previous: null, error: err.message });
      continue;
    }
    const virtual: PreviewProduct = {
      id: `line:${lineIndex}`,
      name: line.name,
      createdAt: new Date(),
      ...plan.fields,
      servings: plan.serving
        ? [{ sellingPriceTTC: plan.fields.sellingPriceTTC, servingType: { name: plan.serving.name, sortOrder: plan.serving.sortOrder, volumeCl: plan.serving.volumeCl } }]
        : [],
      sameAsLine: lineIndex,
    };
    index.add(virtual);
    byProductId.set(virtual.id, virtual);
    if (aliasKey) aliasOf.set(aliasKey, virtual.id);
    out.push({ index: lineIndex, match: null, candidates, previous: null });
  }
  return { lines: out };
}
