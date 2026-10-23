import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { calculateServingMargin, DEFAULT_SERVING_TYPES, ServingMarginResult } from '@margebar/shared';
import { HttpError } from '../utils/validation';

type Tx = Prisma.TransactionClient;

export interface ServingInput {
  servingTypeId: string;
  sellingPriceTTC: number;
}

export interface ValidatedServing {
  servingTypeId: string;
  sellingPriceTTC: number;
  name: string;
  volumeCl: number;
  sortOrder: number;
}

const fmtPrice = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

/**
 * Serialize the writes of one product (servings replace / primary re-sync): concurrent
 * transactions on the same product wait for each other instead of interleaving their
 * delete/upsert/sync statements (READ COMMITTED would otherwise leave the union of both sets
 * and a headline price synced to a non-primary serving).
 */
export async function lockProduct(tx: Tx, productId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${productId} FOR UPDATE`;
}

async function createDefaultServingTypes(tx: Tx, userId: string) {
  // Per-user advisory lock (released at commit): concurrent first calls on a new account
  // create the defaults once instead of once per request.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
  const existing = await tx.servingType.findMany({ where: { userId }, orderBy: { sortOrder: 'asc' } });
  if (existing.length) return existing;
  await tx.servingType.createMany({
    data: DEFAULT_SERVING_TYPES.map((st) => ({ userId, name: st.name, volumeCl: st.volumeCl, icon: st.icon, sortOrder: st.sortOrder })),
  });
  return tx.servingType.findMany({ where: { userId }, orderBy: { sortOrder: 'asc' } });
}

/** Create the default serving types the first time a user needs them (race-free). */
export async function ensureServingTypes(userId: string, db: Tx | typeof prisma = prisma) {
  const existing = await db.servingType.findMany({ where: { userId }, orderBy: { sortOrder: 'asc' } });
  if (existing.length) return existing;
  if (db === prisma) return prisma.$transaction((tx) => createDefaultServingTypes(tx, userId));
  return createDefaultServingTypes(db as Tx, userId);
}

const fmtCl = (n: number) => `${String(Math.round(n * 100) / 100).replace('.', ',')} cl`;

/**
 * Every serving must fit in the container: a 5 cl glass from a 3 cl miniature is a meaningless
 * (negative) margin. Throws a 400 naming the first offending service, with one detail per service.
 */
export function assertServingsFit(servings: { name: string; volumeCl: number; servingTypeId?: string }[], containerVolumeCl: number, field = 'servings'): void {
  const over = servings.filter((s) => s.volumeCl > containerVolumeCl);
  if (!over.length) return;
  const first = over[0];
  const more = over.length > 1 ? ` (et ${over.length - 1} autre${over.length > 2 ? 's' : ''})` : '';
  throw new HttpError(400,
    `Le service « ${first.name} » (${fmtCl(first.volumeCl)}) dépasse la contenance (${fmtCl(containerVolumeCl)})${more}. Retirez-le ou augmentez la contenance.`,
    { details: over.map((s) => ({ field, label: s.name, message: `Le service « ${s.name} » (${fmtCl(s.volumeCl)}) dépasse la contenance (${fmtCl(containerVolumeCl)}).`, code: 'too_big', ...(s.servingTypeId ? { servingTypeId: s.servingTypeId } : {}) })) });
}

/** A serving type as `checkServings` needs it. */
export interface ServingTypeRow {
  id: string;
  name: string;
  volumeCl: number;
  sortOrder: number;
}

/**
 * Check a full set of servings before writing anything:
 * - every serving type must belong to the user,
 * - every price must be > 0 (the message names the services concerned),
 * - with `containerVolumeCl`, every serving must fit in the container,
 * - duplicates are merged (last one wins).
 * Returned list is sorted primary first (lowest sortOrder, then smallest volume).
 */
export async function validateServings(
  userId: string,
  servings: ServingInput[],
  opts: { containerVolumeCl?: number } = {},
  db: Tx | typeof prisma = prisma,
): Promise<ValidatedServing[]> {
  const ids = [...new Set(servings.map((s) => s.servingTypeId))];
  if (!ids.length) return [];
  const types = await db.servingType.findMany({ where: { userId, id: { in: ids } } });
  return checkServings(servings, new Map(types.map((t) => [t.id, t])), opts);
}

/**
 * Same checks as `validateServings`, against serving types already loaded (`typeById` holds the
 * user's types; a type missing from it is « introuvable »). Throws an HttpError 400.
 */
export function checkServings(
  servings: ServingInput[],
  typeById: Map<string, ServingTypeRow>,
  opts: { containerVolumeCl?: number } = {},
): ValidatedServing[] {
  const byId = new Map<string, ServingInput>();
  for (const s of servings) byId.set(s.servingTypeId, s);
  const ids = [...byId.keys()];
  if (!ids.length) return [];

  const unknown = ids.filter((id) => !typeById.has(id));
  if (unknown.length) {
    throw new HttpError(400, unknown.length > 1
      ? `${unknown.length} services sont introuvables (supprimés ou d’un autre compte). Rechargez la page puis réessayez.`
      : 'Un des services est introuvable (supprimé ou d’un autre compte). Rechargez la page puis réessayez.', { field: 'servings' });
  }

  const zero = ids.filter((id) => !(Number.isFinite(byId.get(id)!.sellingPriceTTC) && byId.get(id)!.sellingPriceTTC > 0));
  if (zero.length) {
    const names = zero.map((id) => typeById.get(id)!.name);
    throw new HttpError(400, names.length > 1
      ? `Indiquez un prix de vente supérieur à 0 € pour les services : ${names.join(', ')}.`
      : `Indiquez un prix de vente supérieur à 0 € pour le service « ${names[0]} ».`,
      { details: zero.map((id) => ({ field: 'servings', label: typeById.get(id)!.name, message: `Prix de vente manquant pour « ${typeById.get(id)!.name} ».`, code: 'too_small', servingTypeId: id })) });
  }

  const tooHigh = ids.filter((id) => byId.get(id)!.sellingPriceTTC > 10_000);
  if (tooHigh.length) {
    throw new HttpError(400, `Le prix de vente de « ${typeById.get(tooHigh[0])!.name} » semble trop élevé (${fmtPrice(byId.get(tooHigh[0])!.sellingPriceTTC)}).`, { field: 'servings' });
  }

  if (opts.containerVolumeCl !== undefined) {
    assertServingsFit(ids.map((id) => ({ name: typeById.get(id)!.name, volumeCl: typeById.get(id)!.volumeCl, servingTypeId: id })), opts.containerVolumeCl);
  }

  return ids
    .map((id) => {
      const t = typeById.get(id)!;
      return { servingTypeId: id, sellingPriceTTC: Math.round(byId.get(id)!.sellingPriceTTC * 100) / 100, name: t.name, volumeCl: t.volumeCl, sortOrder: t.sortOrder };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.volumeCl - b.volumeCl || a.name.localeCompare(b.name));
}

/**
 * Replace the product's servings with exactly `servings` (inside `tx`) and keep the product's
 * headline price in sync with the primary serving (lowest sortOrder):
 * sellingPriceTTC, doseVolumeCl and marginMode = fix_selling_price.
 * A non-empty set is a selling price set by the owner: it also clears `priceToReview`.
 * An empty list removes every serving and leaves the product price (and the flag) unchanged.
 */
export async function replaceServings(tx: Tx, productId: string, servings: ValidatedServing[]): Promise<void> {
  await lockProduct(tx, productId);
  await tx.productServing.deleteMany({
    where: { productId, servingTypeId: { notIn: servings.map((s) => s.servingTypeId) } },
  });
  for (const s of servings) {
    await tx.productServing.upsert({
      where: { productId_servingTypeId: { productId, servingTypeId: s.servingTypeId } },
      create: { productId, servingTypeId: s.servingTypeId, sellingPriceTTC: s.sellingPriceTTC },
      update: { sellingPriceTTC: s.sellingPriceTTC },
    });
  }
  const primary = servings[0];
  if (primary) {
    await tx.product.update({
      where: { id: productId },
      data: { sellingPriceTTC: primary.sellingPriceTTC, doseVolumeCl: primary.volumeCl, marginMode: 'fix_selling_price', priceToReview: false },
    });
  }
}

/** Re-sync the product's headline price/dose on its current primary serving (no-op without servings). */
export async function resyncPrimary(tx: Tx, productId: string): Promise<void> {
  await lockProduct(tx, productId);
  const rest = await tx.productServing.findMany({ where: { productId }, include: { servingType: true } });
  if (!rest.length) return;
  rest.sort((a, b) => a.servingType.sortOrder - b.servingType.sortOrder || a.servingType.volumeCl - b.servingType.volumeCl);
  const p = rest[0];
  await tx.product.update({
    where: { id: productId },
    data: { sellingPriceTTC: p.sellingPriceTTC, doseVolumeCl: p.servingType.volumeCl, marginMode: 'fix_selling_price' },
  });
}

/** Servings of a product with their margins, primary first. Invalid rows are skipped, never thrown. */
export async function getServingResults(product: { id: string; purchasePriceHT: number; containerVolumeCl: number; tvaRate: number }): Promise<ServingMarginResult[]> {
  const rows = await prisma.productServing.findMany({
    where: { productId: product.id },
    include: { servingType: true },
    orderBy: [{ servingType: { sortOrder: 'asc' } }, { servingType: { volumeCl: 'asc' } }],
  });
  const out: ServingMarginResult[] = [];
  for (const ps of rows) {
    try {
      out.push(calculateServingMargin(
        product.purchasePriceHT,
        product.containerVolumeCl,
        product.tvaRate,
        {
          id: ps.servingType.id,
          userId: ps.servingType.userId,
          name: ps.servingType.name,
          volumeCl: ps.servingType.volumeCl,
          icon: ps.servingType.icon,
          sortOrder: ps.servingType.sortOrder,
        },
        ps.sellingPriceTTC,
      ));
    } catch (err: any) {
      console.warn(`[SERVINGS] skipped invalid serving ${ps.id}: ${err?.message}`);
    }
  }
  return out;
}
