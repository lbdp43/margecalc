/**
 * POST /api/products/prices/batch — several price changes in ONE transaction (all or nothing).
 *
 * Each update: { productId, purchasePriceHT?, sellingPriceTTC?, servings?, priceToReview?,
 *                marginMode?, targetMarginPercent?, coefficient?, doseVolumeCl? }
 * - purchasePriceHT: new purchase price HT (≥ 0), price history 'manual'; null = unchanged;
 * - sellingPriceTTC: new selling price (> 0) of a product without services (it becomes a fixed price);
 *   ignored when `servings` is a non-empty set (the headline follows the primary service);
 * - servings: the FULL set of services (like PUT /servings): services not sent are removed;
 * - priceToReview: only to restore the flag on undo; otherwise any selling/serving price clears it;
 * - marginMode, targetMarginPercent, coefficient, doseVolumeCl: restore fields (« Annuler » posts
 *   `previous` back). Written as sent when the product has no services after the update, ignored
 *   with a non-empty `servings`. With `marginMode`, `sellingPriceTTC` is the stored price (null = none).
 * Everything is validated (same rules as the single routes) before anything is written; the
 * errors name the product. The response carries `previous`: post `{ updates: previous }` to undo.
 */
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { BatchPriceSnapshot, BatchPricesResult, MarginMode } from '@margebar/shared';
import { prisma } from '../config/database';
import { HttpError, toIssues } from '../utils/validation';
import { assertMarginInputs, listProducts } from './product.service';
import { checkServings, replaceServings, ServingTypeRow, ValidatedServing } from './productServing.service';

export const BATCH_MAX_UPDATES = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const updateSchema = z.object({
  productId: z.string({ required_error: 'Produit manquant.', invalid_type_error: 'Produit inconnu.' }).uuid('Produit inconnu.'),
  purchasePriceHT: z.number().min(0).max(100_000).nullable().optional(),
  sellingPriceTTC: z.number().min(0).max(100_000).nullable().optional(),
  servings: z.array(z.object({
    servingTypeId: z.string({ required_error: 'Choisissez un service.' }).min(1, 'Choisissez un service.'),
    sellingPriceTTC: z.number({ required_error: 'Indiquez le prix de vente du service.', invalid_type_error: 'Le prix de vente du service doit être un nombre.' }),
  }, { invalid_type_error: 'Service illisible : rechargez puis réessayez.' }), { invalid_type_error: 'La liste des services est illisible : rechargez puis réessayez.' }).max(50).optional(),
  priceToReview: z.boolean().optional(),
  // Restore fields (undo). Their consistency with the mode is checked by assertMarginInputs.
  marginMode: z.nativeEnum(MarginMode).optional(),
  targetMarginPercent: z.number().min(0).max(100_000).nullable().optional(),
  coefficient: z.number().min(0).max(100_000).nullable().optional(),
  doseVolumeCl: z.number().positive().max(100_000).optional(),
}, { invalid_type_error: 'Modification illisible : rechargez puis réessayez.', required_error: 'Modification illisible : rechargez puis réessayez.' });
type BatchUpdate = z.infer<typeof updateSchema>;

interface Issue {
  field: string;
  label: string;
  message: string;
  code: string;
  productId?: string;
  index: number;
}

/** « Indiquez… » → « indiquez… » after « « Produit » : » (keeps acronyms). */
const lowerFirst = (m: string) => (m.length > 1 && m[1] === m[1].toLowerCase() ? m[0].toLowerCase() + m.slice(1) : m);
const withName = (name: string, message: string) => `« ${name} » : ${lowerFirst(message)}`;

const PRODUCT_INCLUDE = {
  servings: { include: { servingType: true } },
} satisfies Prisma.ProductInclude;
type Row = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

function currentServings(p: Row) {
  return [...p.servings].sort((a, b) => a.servingType.sortOrder - b.servingType.sortOrder || a.servingType.volumeCl - b.servingType.volumeCl);
}

interface Plan {
  index: number;
  product: Row;
  update: BatchUpdate;
  servings: ValidatedServing[] | null;
  data: Prisma.ProductUncheckedUpdateInput;
  purchaseChanged: boolean;
  previous: BatchPriceSnapshot;
}

const SOLD_BY_SERVICES = 'Ce produit est vendu par services : envoyez le prix de chaque service.';

/** Validate one update against its (locked) product; returns the plan or throws an HttpError. */
function planUpdate(index: number, p: Row, u: BatchUpdate, typeById: Map<string, ServingTypeRow>): Plan {
  const current = currentServings(p);
  const servings = u.servings !== undefined ? checkServings(u.servings, typeById, { containerVolumeCl: p.containerVolumeCl }) : null;
  const finalServings = servings ?? current.map((s) => ({ sellingPriceTTC: s.sellingPriceTTC, volumeCl: s.servingType.volumeCl }));
  const newPurchase = u.purchasePriceHT ?? undefined; // null = unchanged
  const purchasePriceHT = newPurchase ?? p.purchasePriceHT;
  const restoreMode = u.marginMode !== undefined;
  const restoreAny = restoreMode || u.targetMarginPercent !== undefined || u.coefficient !== undefined || u.doseVolumeCl !== undefined;
  const setsUnitPrice = !restoreMode && u.sellingPriceTTC !== undefined && u.sellingPriceTTC !== null && !(servings && servings.length);

  if (newPurchase === undefined && !setsUnitPrice && u.servings === undefined && u.priceToReview === undefined && !restoreAny) {
    throw new HttpError(400, 'Rien à modifier : indiquez un prix d’achat, un prix de vente ou les services.', { field: 'productId' });
  }
  if ((setsUnitPrice || restoreAny) && current.length && !servings) {
    throw new HttpError(400, SOLD_BY_SERVICES, { field: setsUnitPrice ? 'sellingPriceTTC' : 'servings' });
  }
  // Restore fields only describe a product without services: with a non-empty set, the primary
  // service sets the headline price, dose and mode.
  const applyRestore = restoreAny && !finalServings.length;
  const restoredSelling = u.sellingPriceTTC === undefined ? p.sellingPriceTTC : u.sellingPriceTTC;

  const base = {
    purchasePriceHT,
    containerVolumeCl: p.containerVolumeCl,
    doseVolumeCl: applyRestore && u.doseVolumeCl !== undefined ? u.doseVolumeCl : p.doseVolumeCl,
    marginMode: p.marginMode,
    sellingPriceTTC: p.sellingPriceTTC,
    targetMarginPercent: applyRestore && u.targetMarginPercent !== undefined ? u.targetMarginPercent : p.targetMarginPercent,
    coefficient: applyRestore && u.coefficient !== undefined ? u.coefficient : p.coefficient,
    tvaRate: p.tvaRate,
  };
  if (finalServings.length) {
    const primary = finalServings[0];
    assertMarginInputs({ ...base, marginMode: MarginMode.FIX_SELLING_PRICE, sellingPriceTTC: primary.sellingPriceTTC, doseVolumeCl: primary.volumeCl }, 'servings');
  } else if (applyRestore && restoreMode) {
    assertMarginInputs({ ...base, marginMode: u.marginMode!, sellingPriceTTC: restoredSelling });
  } else if (setsUnitPrice) {
    assertMarginInputs({ ...base, marginMode: MarginMode.FIX_SELLING_PRICE, sellingPriceTTC: u.sellingPriceTTC! }, 'sellingPriceTTC');
  } else {
    assertMarginInputs(base);
  }

  // Undo snapshot: the stored pricing, so `{ updates: previous }` restores it exactly.
  const previous: BatchPriceSnapshot = {
    productId: p.id,
    purchasePriceHT: p.purchasePriceHT,
    sellingPriceTTC: p.sellingPriceTTC,
    servings: current.map((s) => ({ servingTypeId: s.servingTypeId, sellingPriceTTC: s.sellingPriceTTC })),
    priceToReview: p.priceToReview,
    marginMode: p.marginMode as MarginMode,
    targetMarginPercent: p.targetMarginPercent,
    coefficient: p.coefficient,
    doseVolumeCl: p.doseVolumeCl,
  };

  const purchaseChanged = newPurchase !== undefined && newPurchase !== p.purchasePriceHT;
  const data: Prisma.ProductUncheckedUpdateInput = {};
  if (purchaseChanged) data.purchasePriceHT = newPurchase;
  if (applyRestore && restoreMode) {
    data.marginMode = u.marginMode;
    data.sellingPriceTTC = restoredSelling; // as stored (an undo restores the exact value)
  } else if (setsUnitPrice) {
    data.sellingPriceTTC = Math.round(u.sellingPriceTTC! * 100) / 100;
    data.marginMode = MarginMode.FIX_SELLING_PRICE;
  }
  if (applyRestore) {
    if (u.targetMarginPercent !== undefined) data.targetMarginPercent = u.targetMarginPercent;
    if (u.coefficient !== undefined) data.coefficient = u.coefficient;
    if (u.doseVolumeCl !== undefined) data.doseVolumeCl = u.doseVolumeCl;
  }
  // Any selling/serving price set (the same one included: it confirms it) ends « À vérifier ».
  const touchesSellingPrice = setsUnitPrice || !!(servings && servings.length) || (applyRestore && restoreMode);
  if (u.priceToReview !== undefined) data.priceToReview = u.priceToReview;
  else if (touchesSellingPrice) data.priceToReview = false;

  return { index, product: p, update: u, servings, data, purchaseChanged, previous };
}

function batchError(issues: Issue[]): HttpError {
  const products = new Set(issues.map((i) => i.productId ?? `#${i.index}`));
  if (issues.length === 1) return new HttpError(400, issues[0].message, { details: issues });
  const shown = issues.slice(0, 3).map((i) => i.message.replace(/\.$/, ''));
  const more = issues.length > 3 ? ` (et ${issues.length - 3} autre${issues.length - 3 > 1 ? 's' : ''})` : '';
  const head = products.size > 1 ? `${products.size} produits à corriger` : `${issues.length} erreurs`;
  return new HttpError(400, `${head} : ${shown.join(' ; ')}${more}. Aucun prix n’a été modifié.`, { details: issues });
}

export async function applyPriceBatch(userId: string, rawUpdates: unknown[]): Promise<BatchPricesResult> {
  return prisma.$transaction(async (tx) => {
    const rawIdOf = (raw: unknown) => {
      const id = raw && typeof raw === 'object' ? (raw as { productId?: unknown }).productId : undefined;
      return typeof id === 'string' && UUID_RE.test(id) ? id : null;
    };
    // Every well-formed id is loaded, even when its update fails the schema: the error then names
    // the product and carries its productId.
    const ids = [...new Set(rawUpdates.map(rawIdOf).filter((id): id is string => !!id))];

    // Lock the products (id order: two batches never deadlock), then read them.
    if (ids.length) {
      await tx.$queryRaw`SELECT id FROM "Product" WHERE "userId" = ${userId} AND id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
    }
    const rows = ids.length ? await tx.product.findMany({ where: { userId, id: { in: ids } }, include: PRODUCT_INCLUDE }) : [];
    const byId = new Map(rows.map((p) => [p.id, p]));
    const types = await tx.servingType.findMany({ where: { userId }, select: { id: true, name: true, volumeCl: true, sortOrder: true } });
    const typeById = new Map(types.map((t) => [t.id, t]));

    const issues: Issue[] = [];
    const plans: Plan[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < rawUpdates.length; index++) {
      const rawId = rawIdOf(rawUpdates[index]);
      const known = rawId ? byId.get(rawId) : undefined;
      const label = known?.name ?? `produit n° ${index + 1}`;
      const prefix = (m: string) => withName(known?.name ?? `Produit n° ${index + 1}`, m);
      const ref = known ? { productId: known.id } : {};
      const r = updateSchema.safeParse(rawUpdates[index]);
      if (!r.success) {
        for (const i of toIssues(r.error)) {
          issues.push({ field: `updates.${index}${i.field ? `.${i.field}` : ''}`, label, message: prefix(i.message), code: i.code, ...ref, index });
        }
        continue;
      }
      const u = r.data;
      const p = byId.get(u.productId);
      if (!p) {
        issues.push({ field: `updates.${index}.productId`, label, message: prefix('Produit introuvable (supprimé ou d’un autre compte). Rechargez puis réessayez.'), code: 'not_found', index });
        continue;
      }
      if (seen.has(p.id)) {
        issues.push({ field: `updates.${index}.productId`, label, message: prefix('Ce produit apparaît deux fois : regroupez ses changements en une seule ligne.'), code: 'duplicate', productId: p.id, index });
        continue;
      }
      seen.add(p.id);
      try {
        plans.push(planUpdate(index, p, u, typeById));
      } catch (err) {
        if (!(err instanceof HttpError)) throw err;
        const details = Array.isArray(err.extra.details) ? (err.extra.details as { field?: string; code?: string }[]) : [];
        const field = details[0]?.field || '';
        issues.push({ field: `updates.${index}${field ? `.${field}` : ''}`, label, message: prefix(err.message), code: details[0]?.code || 'custom', productId: p.id, index });
      }
    }
    if (issues.length) throw batchError(issues);

    for (const plan of plans) {
      const { product: p, data } = plan;
      if (plan.purchaseChanged) {
        await tx.priceHistory.create({ data: { productId: p.id, oldPrice: p.purchasePriceHT, newPrice: plan.update.purchasePriceHT!, source: 'manual' } });
      }
      // Services first: a non-empty set re-syncs the headline (and clears the flag); `data` then
      // applies the purchase price, the restored pricing of a product left without services and an
      // explicit priceToReview (undo).
      if (plan.servings) await replaceServings(tx, p.id, plan.servings);
      if (Object.keys(data).length) await tx.product.update({ where: { id: p.id }, data });
    }

    const updated = await listProducts({ userId, id: { in: plans.map((pl) => pl.product.id) } }, tx);
    const updatedById = new Map(updated.map((p) => [p.id, p]));
    return {
      products: plans.map((pl) => updatedById.get(pl.product.id)!).filter(Boolean) as unknown as BatchPricesResult['products'],
      previous: plans.map((pl) => pl.previous),
    };
  }, { maxWait: 10_000, timeout: 30_000 });
}
