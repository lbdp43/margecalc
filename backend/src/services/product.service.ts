import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import {
  calculateMargin,
  deriveSellingPriceTTC,
  IMPORT_DEFAULT_COEFFICIENT,
  MarginMode,
  MarginResult,
  CreateProductInput,
  ImportLineResult,
  ImportProductsResult,
} from '@margebar/shared';
import { HttpError } from '../utils/validation';
import { assertServingsFit, ensureServingTypes, lockProduct, replaceServings, resyncPrimary, ServingInput, validateServings } from './productServing.service';

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

/** GET /api/products — thumbnailUrl + hasImage, never imageUrl. */
export async function getProducts(userId: string, categoryId?: string) {
  const where: Prisma.ProductWhereInput = { userId };
  if (categoryId) where.categoryId = categoryId;

  const [products, withImage] = await Promise.all([
    prisma.product.findMany({ where, select: LIST_SELECT, orderBy: { updatedAt: 'desc' } }),
    prisma.product.findMany({ where: { ...where, OR: USABLE_IMAGE_WHERE }, select: { id: true } }),
  ]);
  const hasImage = new Set(withImage.map((p) => p.id));
  return products.map((p) => ({ ...enrichProduct(p), hasImage: hasImage.has(p.id) }));
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
// Invoice import — POST /api/products/import
// ---------------------------------------------------------------------------

/** Default dose (cl) per category when the invoice line has none. */
const DEFAULT_DOSE_BY_SLUG: Record<string, number> = {
  vins: 12,
  bieres: 25,
  softs: 25,
};

/** Categories whose small containers (can, bottle ≤ 50 cl) are served whole. */
const UNIT_SOLD_SLUGS = new Set(['bieres', 'softs']);

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const normName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

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
}

/**
 * Import invoice lines one by one. Each line is validated before anything is written and is
 * committed in its own transaction, so one bad line never fails the batch.
 * - selling price missing/≤ 0 → derived with coefficient 4, rounded to 0,10 € (never 0);
 * - same name + same container already in the catalogue → purchase price updated (history 'invoice');
 * - the primary serving matching the dose is created when the user has one.
 */
export async function importProducts(
  userId: string,
  supplier: string | null | undefined,
  lines: { index: number; line: NormalizedImportLine | null; error?: string; rawName: string }[],
): Promise<ImportProductsResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'Utilisateur non trouvé');
  // Built-in categories first (slug lookups must resolve to them), then the user's own ones.
  const categories = await prisma.category.findMany({
    where: { OR: [{ userId: null }, { userId }] },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  const bySlug = new Map<string, (typeof categories)[number]>();
  for (const c of [...categories].sort((a, b) => Number(a.userId !== null) - Number(b.userId !== null))) {
    if (!bySlug.has(c.slug)) bySlug.set(c.slug, c);
  }
  const byId = new Map(categories.map((c) => [c.id, c]));
  const fallbackCat = bySlug.get('spiritueux') ?? categories[0];
  const servingTypes = await ensureServingTypes(userId);

  const userTva = user.isAutoEntrepreneur ? 0 : user.defaultTvaRate;
  const userContainer = user.defaultContainerVolumeCl > 0 ? user.defaultContainerVolumeCl : 70;

  const results: ImportLineResult[] = [];
  for (const { index, line, error, rawName } of lines) {
    if (!line) {
      results.push({ index, ok: false, name: rawName, error: error || 'Ligne invalide.' });
      continue;
    }
    try {
      let cat = fallbackCat;
      if (line.categoryId) {
        const c = byId.get(line.categoryId);
        if (!c) throw new HttpError(400, 'Catégorie inconnue.', { field: 'categoryId' });
        cat = c;
      } else if (line.category) {
        cat = bySlug.get(line.category) ?? fallbackCat;
      }
      if (!cat) throw new HttpError(500, 'Aucune catégorie disponible.');
      const categoryId = cat.id;

      const purchasePriceHT = line.purchasePriceHT && line.purchasePriceHT > 0 ? round3(line.purchasePriceHT) : 0;
      const containerVolumeCl = line.containerVolumeCl && line.containerVolumeCl > 0 ? line.containerVolumeCl : userContainer;
      // Beers/softs in a can or bottle (≤ 50 cl) are sold as the whole unit: 33 cl can → 33 cl dose.
      const soldByUnit = UNIT_SOLD_SLUGS.has(cat.slug) && containerVolumeCl <= 50;
      const doseRaw = line.doseVolumeCl && line.doseVolumeCl > 0
        ? line.doseVolumeCl
        : (soldByUnit ? containerVolumeCl : (DEFAULT_DOSE_BY_SLUG[cat.slug] ?? 5));
      const doseVolumeCl = Math.min(doseRaw, containerVolumeCl);
      const tvaRate = typeof line.tvaRate === 'number' && line.tvaRate >= 0 && line.tvaRate < 1 ? line.tvaRate : userTva;
      const lineSupplier = (line.supplier || supplier || '').trim().slice(0, 200) || null;
      const key = normName(line.name);

      const outcome = await prisma.$transaction(async (tx) => {
        // Same user + same product name + same container: one import at a time. Two concurrent
        // imports of the same new line (double tap, client retry after a timeout) wait here, and
        // the second one finds the product created by the first instead of duplicating it.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`import|${userId}|${key}|${containerVolumeCl}`}))`;
        const sameContainer = await tx.product.findMany({
          where: { userId, containerVolumeCl },
          select: {
            id: true, name: true, purchasePriceHT: true, sellingPriceTTC: true,
            servings: { select: { sellingPriceTTC: true, servingType: { select: { sortOrder: true, volumeCl: true } } } },
          },
          orderBy: { createdAt: 'asc' },
        });
        const match = sameContainer.find((p) => normName(p.name) === key);

        // Existing product (same name + container): update the purchase price only.
        if (match) {
          if (purchasePriceHT > 0 && purchasePriceHT !== match.purchasePriceHT) {
            await tx.priceHistory.create({ data: { productId: match.id, oldPrice: match.purchasePriceHT, newPrice: purchasePriceHT, source: 'invoice' } });
            await tx.product.update({ where: { id: match.id }, data: { purchasePriceHT, ...(lineSupplier ? { supplier: lineSupplier } : {}) } });
          }
          // Headline price as the app shows it (primary service first, see withHeadline).
          const shown = primaryServing(match.servings, containerVolumeCl)?.sellingPriceTTC ?? match.sellingPriceTTC ?? 0;
          return { action: 'updated' as const, productId: match.id, sellingPriceTTC: shown, priceDerived: false };
        }

        let sellingPriceTTC = line.sellingPriceTTC && line.sellingPriceTTC > 0 ? Math.round(line.sellingPriceTTC * 100) / 100 : 0;
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
        // Throwing here rolls the (still empty) transaction back: nothing is written for this line.
        assertMarginInputs(fields);

        const serving = servingTypes
          .filter((st) => Math.abs(st.volumeCl - doseVolumeCl) < 0.01)
          .sort((a, b) => a.sortOrder - b.sortOrder)[0];

        const created = await tx.product.create({
          data: {
            userId,
            categoryId,
            name: line.name,
            ...fields,
            alcoholDegree: line.alcoholDegree && line.alcoholDegree > 0 ? line.alcoholDegree : 0,
            supplier: lineSupplier,
          },
          select: { id: true },
        });
        if (serving) {
          await tx.productServing.create({ data: { productId: created.id, servingTypeId: serving.id, sellingPriceTTC } });
        }
        return { action: 'created' as const, productId: created.id, sellingPriceTTC, priceDerived };
      });
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
