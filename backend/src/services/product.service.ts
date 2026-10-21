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
import { ensureServingTypes, replaceServings, ServingInput, validateServings } from './productServing.service';

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

function enrichProduct<T extends MarginFields>(product: T): T & { computed: MarginResult } {
  return { ...product, computed: computeMarginSafe(product) };
}

/** Throws a readable 400 when the margin-mode fields are inconsistent — checked BEFORE any write. */
export function assertMarginInputs(p: MarginFields): void {
  switch (p.marginMode) {
    case MarginMode.FIX_SELLING_PRICE:
      if (!(typeof p.sellingPriceTTC === 'number' && p.sellingPriceTTC > 0)) {
        throw new HttpError(400, 'Indiquez un prix de vente TTC supérieur à 0 €.');
      }
      break;
    case MarginMode.FIX_TARGET_MARGIN:
      if (!(typeof p.targetMarginPercent === 'number' && p.targetMarginPercent >= 0 && p.targetMarginPercent < 100)) {
        throw new HttpError(400, 'Indiquez une marge cible comprise entre 0 et 99,9 %.');
      }
      break;
    case MarginMode.FIX_COEFFICIENT:
      if (!(typeof p.coefficient === 'number' && p.coefficient > 0)) {
        throw new HttpError(400, 'Indiquez un coefficient supérieur à 0.');
      }
      break;
    default:
      throw new HttpError(400, 'Mode de calcul inconnu.');
  }
  try {
    calculateMargin(marginInput(p));
  } catch {
    throw new HttpError(400, 'Les prix et volumes saisis ne permettent pas de calculer la marge. Vérifiez la contenance et la dose.');
  }
}

async function assertCategory(categoryId: string): Promise<void> {
  const cat = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!cat) throw new HttpError(400, 'Catégorie inconnue : choisissez une catégorie dans la liste.');
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

/** GET /api/products — thumbnailUrl + hasImage, never imageUrl. */
export async function getProducts(userId: string, categoryId?: string) {
  const where: Prisma.ProductWhereInput = { userId };
  if (categoryId) where.categoryId = categoryId;

  const [products, withImage] = await Promise.all([
    prisma.product.findMany({ where, select: LIST_SELECT, orderBy: { updatedAt: 'desc' } }),
    prisma.product.findMany({ where: { ...where, imageUrl: { not: null } }, select: { id: true } }),
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
  return { ...enrichProduct(product), hasImage: !!product.imageUrl };
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
  await assertCategory(data.categoryId);
  const servings = data.servings ? await validateServings(userId, data.servings) : null;
  if (servings?.length) {
    // The primary serving sets the headline price: validate with it.
    assertMarginInputs({ ...fields, marginMode: MarginMode.FIX_SELLING_PRICE, sellingPriceTTC: servings[0].sellingPriceTTC, doseVolumeCl: servings[0].volumeCl });
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
  if (rest.categoryId && rest.categoryId !== existing.categoryId) await assertCategory(rest.categoryId);
  const servings = servingsInput ? await validateServings(userId, servingsInput) : null;
  if (servings?.length) {
    assertMarginInputs({ ...merged, marginMode: MarginMode.FIX_SELLING_PRICE, sellingPriceTTC: servings[0].sellingPriceTTC, doseVolumeCl: servings[0].volumeCl });
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
    alcoholDegree: rest.alcoholDegree,
    supplier: rest.supplier === undefined ? undefined : (rest.supplier || null),
    imageUrl: rest.imageUrl,
    thumbnailUrl: rest.thumbnailUrl,
  };

  await prisma.$transaction(async (tx) => {
    // Track price history
    if (rest.purchasePriceHT !== undefined && rest.purchasePriceHT !== existing.purchasePriceHT) {
      await tx.priceHistory.create({
        data: { productId: id, oldPrice: existing.purchasePriceHT, newPrice: rest.purchasePriceHT, source: 'manual' },
      });
    }
    await tx.product.update({ where: { id }, data: update });
    if (servings) await replaceServings(tx, id, servings);
  });

  return getProduct(id, userId);
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
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const byId = new Map(categories.map((c) => [c.id, c]));
  const fallbackCat = bySlug.get('spiritueux') ?? categories[0];
  const servingTypes = await ensureServingTypes(userId);
  const existing = await prisma.product.findMany({
    where: { userId },
    select: { id: true, name: true, containerVolumeCl: true, purchasePriceHT: true },
  });
  const existingByKey = new Map(existing.map((p) => [`${normName(p.name)}|${p.containerVolumeCl}`, p]));

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
        if (!c) throw new HttpError(400, 'Catégorie inconnue.');
        cat = c;
      } else if (line.category) {
        cat = bySlug.get(line.category) ?? fallbackCat;
      }
      if (!cat) throw new HttpError(500, 'Aucune catégorie disponible.');

      const purchasePriceHT = line.purchasePriceHT && line.purchasePriceHT > 0 ? round3(line.purchasePriceHT) : 0;
      const containerVolumeCl = line.containerVolumeCl && line.containerVolumeCl > 0 ? line.containerVolumeCl : userContainer;
      const doseRaw = line.doseVolumeCl && line.doseVolumeCl > 0 ? line.doseVolumeCl : (DEFAULT_DOSE_BY_SLUG[cat.slug] ?? 5);
      const doseVolumeCl = Math.min(doseRaw, containerVolumeCl);
      const tvaRate = typeof line.tvaRate === 'number' && line.tvaRate >= 0 && line.tvaRate < 1 ? line.tvaRate : userTva;
      const lineSupplier = (line.supplier || supplier || '').trim().slice(0, 200) || null;

      // Existing product (same name + container): update the purchase price only.
      const key = `${normName(line.name)}|${containerVolumeCl}`;
      const match = existingByKey.get(key);
      if (match) {
        if (purchasePriceHT > 0 && purchasePriceHT !== match.purchasePriceHT) {
          await prisma.$transaction([
            prisma.priceHistory.create({ data: { productId: match.id, oldPrice: match.purchasePriceHT, newPrice: purchasePriceHT, source: 'invoice' } }),
            prisma.product.update({ where: { id: match.id }, data: { purchasePriceHT, ...(lineSupplier ? { supplier: lineSupplier } : {}) } }),
          ]);
          match.purchasePriceHT = purchasePriceHT;
        }
        const current = await prisma.product.findUnique({ where: { id: match.id }, select: { sellingPriceTTC: true } });
        results.push({ index, ok: true, name: line.name, productId: match.id, sellingPriceTTC: current?.sellingPriceTTC ?? 0, priceDerived: false, action: 'updated' });
        continue;
      }

      let sellingPriceTTC = line.sellingPriceTTC && line.sellingPriceTTC > 0 ? Math.round(line.sellingPriceTTC * 100) / 100 : 0;
      let priceDerived = false;
      if (!(sellingPriceTTC > 0)) {
        sellingPriceTTC = deriveSellingPriceTTC(purchasePriceHT, containerVolumeCl, doseVolumeCl, tvaRate, IMPORT_DEFAULT_COEFFICIENT);
        priceDerived = true;
      }
      if (!(sellingPriceTTC > 0)) {
        throw new HttpError(400, 'Prix d’achat manquant : impossible de calculer un prix de vente. Indiquez le prix d’achat HT ou un prix de vente.');
      }

      const fields = {
        purchasePriceHT, containerVolumeCl, doseVolumeCl,
        marginMode: MarginMode.FIX_SELLING_PRICE as string,
        sellingPriceTTC, targetMarginPercent: null, coefficient: null, tvaRate,
      };
      assertMarginInputs(fields);

      const serving = servingTypes
        .filter((st) => Math.abs(st.volumeCl - doseVolumeCl) < 0.01)
        .sort((a, b) => a.sortOrder - b.sortOrder)[0];

      const productId = await prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            userId,
            categoryId: cat!.id,
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
        return created.id;
      });
      existingByKey.set(key, { id: productId, name: line.name, containerVolumeCl, purchasePriceHT });
      results.push({ index, ok: true, name: line.name, productId, sellingPriceTTC, priceDerived, action: 'created' });
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
