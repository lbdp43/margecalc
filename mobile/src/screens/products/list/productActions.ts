/**
 * Product actions shared by « Mes produits » and the product detail:
 * duplicate (client-side copy with its services and photo) and delete
 * (lot 2 n° 11: no « définitive » dialog any more — the product leaves the
 * lists at once and the undo toast « Aperol supprimé · Annuler ⑥ » holds the
 * DELETE until its countdown ends; see `deleteWithUndo`, also used by the form).
 *
 * Write failures go through the form group's `describeSaveError` (the
 * backend's French `error` as is, then offline / timeout / status sentences),
 * so a save and a delete read the same everywhere. Offline is refused up front
 * with a clear sentence (no silent queue, no fake id — RC6).
 */
import { useCallback, useRef } from 'react';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import type { BatchPriceUpdate, BatchPricesResult, CreateProductInput, ProductWithMargin } from '@margebar/shared';
import { toast, sortedServings } from '../../../components/ui';
import type { UndoHandle } from '../../../components/ui';
import { haptics } from '../../../theme/haptics';
import * as productService from '../../../services/product.service';
import { isOnline, isNetworkError, isTimeoutError } from '../../../services/offline';
import { describeSaveError } from '../form/errors';
import { useAuthStore } from '../../../store/auth.store';

const OFFLINE_DUPLICATE = 'Pas de connexion : la copie n’a pas été créée. Réessayez une fois connecté.';
const OFFLINE_DELETE = 'Pas de connexion : le produit n’a pas été supprimé. Réessayez une fois connecté.';

/** HTTP status of an axios error (undefined for network failures). */
export function apiStatus(err: any): number | undefined {
  return err?.response?.status;
}

/**
 * A failed write (save, delete) as one readable sentence, from the same helper
 * the product form uses. Offline keeps its « Pas de connexion : … » lead-in,
 * since a toast has no separate title.
 */
export function writeErrorMessage(err: any, action: 'save' | 'delete' = 'save'): string {
  const info = describeSaveError(err, action);
  if (!info.offline) return info.message;
  return `Pas de connexion : ${info.message.charAt(0).toLowerCase()}${info.message.slice(1)}`;
}

/** Why a list or a detail could not be loaded: the backend's sentence, else a calm one. */
export function loadErrorMessage(err: any): string {
  const said = err?.response?.data?.error;
  if (typeof said === 'string' && said.trim()) return said.trim();
  if (isTimeoutError(err)) return 'Le serveur met trop de temps à répondre. Réessayez dans un instant.';
  if (!err?.response && isNetworkError(err)) return 'Connexion au serveur impossible. Vérifiez votre réseau puis réessayez.';
  return 'Le serveur ne répond pas. Réessayez dans un instant.';
}

/**
 * Show a result toast at once: a toast still waiting (hidden behind a sheet or
 * a dialog, or a 5 s action toast) is dropped instead of queueing in front.
 */
export function freshToast(kind: 'success' | 'error' | 'info', message: string, opts?: Parameters<typeof toast.success>[1]) {
  toast.clear();
  toast[kind](message, opts);
}

const COPY_RE = /\s*\(copie(?:\s+\d+)?\)\s*$/i;
const NAME_MAX = 200;

/** « Hendrick’s Gin (copie) », then « (copie 2) »… never longer than the API limit. */
export function copyName(name: string, existing: ReadonlyArray<string>): string {
  const base = name.replace(COPY_RE, '').trim() || name.trim();
  const taken = new Set(existing.map((n) => n.trim().toLowerCase()));
  for (let i = 1; i < 100; i++) {
    const suffix = i === 1 ? ' (copie)' : ` (copie ${i})`;
    const candidate = `${base.slice(0, NAME_MAX - suffix.length).trim()}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base.slice(0, NAME_MAX - 8).trim()} (copie)`;
}

type ProductLike = Pick<ProductWithMargin, 'id' | 'name'> & Partial<Pick<ProductWithMargin, 'servings'>>;

export interface DeleteWithUndoOptions {
  /** « Annuler » put the product back (no request was sent). */
  onUndo?: () => void;
  /** The DELETE went through (countdown over, or the app was left). */
  onDeleted?: () => void;
  /** The DELETE failed: the product is back in the lists, the error toast is shown. */
  onFailed?: () => void;
}

/**
 * Delete with undo (lot 2 n° 11), for the list, the detail and the form:
 * the product leaves every list now, the toast « Aperol supprimé · Annuler ⑥ »
 * counts down (paused while held or hovered), then DELETE is sent; leaving the
 * app or the page sends it at once. « Annuler » puts it back with no request.
 * Returns false when nothing was done (offline: there is no undo to offer for
 * a delete that cannot be sent, so it is refused with the usual sentence).
 *
 * After `true`, the caller leaves the product's screens (afterProductDeleted)
 * exactly as after a real delete.
 */
export function deleteWithUndo(queryClient: QueryClient, product: { id: string; name: string }, opts: DeleteWithUndoOptions = {}): boolean {
  if (!isOnline()) {
    freshToast('error', OFFLINE_DELETE);
    return false;
  }
  if (productService.isDeletePending(product.id)) return false;
  haptics.warning();
  const deferred = productService.deferProductDelete(queryClient, product);
  // Plain toasts still waiting (« … créé · Voir ») must not come back over this one.
  toast.clear();
  toast.undo(`${product.name} supprimé`, {
    icon: 'trash-outline',
    commitOnLeave: true,
    onUndo: () => {
      if (!deferred.undo()) return;
      haptics.select();
      opts.onUndo?.();
    },
    onCommit: () => {
      deferred
        .commit()
        .then((r) => {
          if (r === 'deleted') opts.onDeleted?.();
        })
        .catch((err) => {
          haptics.warning();
          const info = describeSaveError(err, 'delete');
          toast.error(
            info.offline
              ? `${product.name} n’a pas été supprimé : pas de connexion. Réessayez une fois connecté.`
              : `${product.name} n’a pas été supprimé : ${lowerFirst(info.message)}`,
          );
          opts.onFailed?.();
        });
    },
  });
  return true;
}

const lowerFirst = (m: string) => (m ? m.charAt(0).toLowerCase() + m.slice(1) : m);

// Signing out closes every undo window: the deletes leave with the old token
// (keepalive), and a price « Annuler » can no longer reach the account.
useAuthStore.subscribe((state, prev) => {
  if (!prev.token || state.token) return;
  productService.flushPendingDeletes(prev.token);
  toast.commitPending();
});

// ─── Price undo windows: only the LATEST change of a product can be undone ───
//
// Every price batch (quick price sheet, purchase price sheet, « Sous
// l’objectif ») shows an undo toast whose « Annuler » posts the batch's
// `previous` back. Two changes of one product within the window would leave
// two toasts, the older one first (toasts wait behind sheets): its « Annuler »
// would wipe the newer change. So a new batch first closes (commits) every
// open window that covers one of its products, and an undo re-checks the
// cached `updatedAt` before writing (a save from the form, an invoice…).

const priceUndos = new Map<string, Set<UndoHandle>>();

/** Close every open price undo window that covers one of these products. */
export function closePriceUndos(productIds: Iterable<string>): void {
  const open = new Set<UndoHandle>();
  for (const id of productIds) priceUndos.get(id)?.forEach((h) => open.add(h));
  open.forEach((h) => h.commit());
}

/**
 * The undo toast of a price batch on these products. Older windows of the
 * same products close first; this one is tracked until it settles.
 */
export function showPriceUndo(productIds: string[], message: string, onUndo: () => void): UndoHandle {
  const ids = Array.from(new Set(productIds));
  closePriceUndos(ids);
  // eslint-disable-next-line prefer-const
  let handle: UndoHandle;
  const release = () => {
    for (const id of ids) {
      const set = priceUndos.get(id);
      if (!set) continue;
      set.delete(handle);
      if (!set.size) priceUndos.delete(id);
    }
  };
  toast.clear();
  handle = toast.undo(message, {
    onUndo: () => {
      release();
      onUndo();
    },
    onCommit: release,
  });
  for (const id of ids) {
    const set = priceUndos.get(id) ?? new Set<UndoHandle>();
    set.add(handle);
    priceUndos.set(id, set);
  }
  return handle;
}

/**
 * True when the product changed after `stamp` (its `updatedAt` right after our
 * write): the list or the open detail holds a newer copy. Also true when it
 * was deleted (or is waiting for its DELETE).
 */
export function changedSince(queryClient: QueryClient, productId: string, stamp: string | null | undefined): boolean {
  if (productService.isDeletePending(productId)) return true;
  const list = queryClient.getQueryData<ProductWithMargin[]>(productService.productKeys.list);
  const listed = list?.find((p) => p.id === productId);
  if (list && !listed) return true;
  const t = stamp ? Date.parse(stamp) : NaN;
  if (!isFinite(t)) return false;
  const detail = queryClient.getQueryData<ProductWithMargin>(productService.productKeys.detail(productId));
  return [listed?.updatedAt, detail?.updatedAt].some((u) => !!u && Date.parse(u) > t);
}

/** « Pas de connexion : l’ancien prix n’a pas été rétabli… » (one or several prices). */
export function undoOfflineMessage(several: boolean): string {
  return several
    ? 'Pas de connexion : les anciens prix n’ont pas été rétablis. Réessayez une fois connecté.'
    : 'Pas de connexion : l’ancien prix n’a pas été rétabli. Réessayez une fois connecté.';
}

/** « X a été modifié depuis : rien n’a été annulé. » */
export function changedSinceMessage(names: string[]): string {
  return names.length > 1
    ? `Ces ${names.length} produits ont été modifiés depuis : rien n’a été annulé.`
    : `${names[0] ?? 'Ce produit'} a été modifié depuis : rien n’a été annulé.`;
}

export interface ApplyPricesOptions {
  /** Toast sentence once applied: « Nouveau prix : Verre 5 cl, 13,10 € ». */
  message: string;
  /** After « Annuler » restored the previous prices (server confirmed). */
  onUndone?: (restored: BatchPricesResult) => void;
}

/**
 * Prices applied at once through POST /api/products/prices/batch (quick price
 * sheet, purchase price sheet): the caches take the new products, then the
 * undo toast « … · Annuler ⑥ » posts the returned `previous` back as is (exact
 * restore: pricing mode, dose, services, « À vérifier »). An older undo window
 * of the same product closes (only the latest change can be undone). Throws
 * the API error (show it as is, through `writeErrorMessage`).
 */
export async function applyPricesWithUndo(queryClient: QueryClient, updates: BatchPriceUpdate[], opts: ApplyPricesOptions): Promise<BatchPricesResult> {
  const result = await productService.batchUpdatePrices(updates);
  productService.applyBatchProducts(queryClient, result.products);
  showPriceUndo(
    result.products.map((p) => p.id),
    opts.message,
    () => {
      undoPrices(queryClient, result, opts.onUndone);
    },
  );
  return result;
}

/**
 * « Annuler » of a price batch: `previous` posted back, caches updated, a
 * short confirmation. A product changed since (another sheet, the form, an
 * invoice, deleted) is left as it is now and named in the toast. A failure
 * offers « Réessayer ».
 */
export async function undoPrices(queryClient: QueryClient, result: BatchPricesResult, onUndone?: (restored: BatchPricesResult) => void): Promise<boolean> {
  const stamps = new Map(result.products.map((p) => [p.id, p]));
  const keep = result.previous.filter((prev) => !changedSince(queryClient, prev.productId, stamps.get(prev.productId)?.updatedAt));
  const skipped = result.previous.filter((prev) => !keep.includes(prev)).map((prev) => stamps.get(prev.productId)?.name ?? 'Ce produit');
  const several = result.previous.length > 1 || (result.previous[0]?.servings.length ?? 0) > 1;
  if (!keep.length) {
    haptics.warning();
    toast.info(changedSinceMessage(skipped));
    return false;
  }
  const retry = { action: { label: 'Réessayer', onPress: () => void undoPrices(queryClient, result, onUndone) } };
  if (!isOnline()) {
    haptics.warning();
    toast.error(undoOfflineMessage(several), retry);
    return false;
  }
  try {
    const restored = await productService.batchUpdatePrices(productService.undoOf(keep));
    productService.applyBatchProducts(queryClient, restored.products);
    haptics.select();
    const done = keep.length > 1 || (keep[0]?.servings.length ?? 0) > 1 ? 'Anciens prix rétablis' : 'Ancien prix rétabli';
    toast.info(
      skipped.length
        ? `${done}, sauf ${skipped.length > 1 ? `${skipped.length} produits modifiés depuis` : `${skipped[0]} (modifié depuis)`}`
        : done,
    );
    onUndone?.(restored);
    return true;
  } catch (err) {
    haptics.warning();
    const info = describeSaveError(err, 'save');
    toast.error(info.offline ? undoOfflineMessage(several) : `Annulation impossible : ${lowerFirst(info.message)}`, retry);
    return false;
  }
}

export interface ProductActionsApi {
  /** Copy the product and its services. Resolves with the new product, or null on failure. */
  duplicate: (product: ProductLike, opts?: { onOpen?: (id: string) => void }) => Promise<ProductWithMargin | null>;
  /** Delete with undo (no dialog). Resolves true when the product left the lists (its DELETE waits for the countdown). */
  remove: (product: ProductLike, opts?: { onConfirmed?: () => void; beforeCacheUpdate?: () => void }) => Promise<boolean>;
}

export function useProductActions(): ProductActionsApi {
  const queryClient = useQueryClient();
  const busy = useRef<Set<string>>(new Set());

  /** False only when the list is loaded and no longer has this product (deleted since). */
  const stillListed = useCallback(
    (id: string) => {
      const list = queryClient.getQueryData<ProductWithMargin[]>(productService.productKeys.list);
      return !list || list.some((p) => p.id === id);
    },
    [queryClient],
  );

  const duplicate = useCallback<ProductActionsApi['duplicate']>(
    async (product, opts) => {
      const key = `dup-${product.id}`;
      if (busy.current.has(key)) return null;
      if (!isOnline()) {
        freshToast('error', OFFLINE_DUPLICATE);
        return null;
      }
      busy.current.add(key);
      try {
        // The detail carries the full photo and the services.
        const full = await productService.getProduct(product.id);
        const list = queryClient.getQueryData<ProductWithMargin[]>(productService.productKeys.list) ?? [];
        const name = copyName(full.name, list.map((p) => p.name));
        const servings = sortedServings(full).map((s) => ({ servingTypeId: s.servingTypeId, sellingPriceTTC: s.sellingPriceTTC }));
        const body: CreateProductInput = {
          name,
          categoryId: full.categoryId,
          purchasePriceHT: full.purchasePriceHT,
          containerVolumeCl: full.containerVolumeCl,
          doseVolumeCl: full.doseVolumeCl,
          marginMode: full.marginMode,
          sellingPriceTTC: full.sellingPriceTTC ?? undefined,
          targetMarginPercent: full.targetMarginPercent ?? undefined,
          coefficient: full.coefficient ?? undefined,
          tvaRate: full.tvaRate,
          alcoholDegree: full.alcoholDegree ?? 0,
          supplier: full.supplier ?? null,
          imageUrl: full.imageUrl ?? null,
          thumbnailUrl: full.thumbnailUrl ?? null,
          ...(servings.length ? { servings } : {}),
        };
        const created = await productService.createProduct(body);
        // Show it at once (the list keeps its sort), then reconcile with the server.
        // The list never carries the full photo (GET /api/products has no imageUrl).
        const listed = { ...created, imageUrl: undefined, hasImage: !!(created.imageUrl || created.thumbnailUrl) } as ProductWithMargin;
        queryClient.setQueryData<ProductWithMargin[]>(productService.productKeys.list, (old) =>
          old ? [listed, ...old.filter((p) => p.id !== created.id)] : old,
        );
        queryClient.invalidateQueries({ queryKey: productService.productKeys.list });
        haptics.success();
        const onOpen = opts?.onOpen;
        freshToast(
          'success',
          `${name} créé`,
          onOpen
            ? {
                action: {
                  label: 'Voir',
                  onPress: () => {
                    // Deleted in the meantime (here or on another device): never open a 404.
                    if (stillListed(created.id)) onOpen(created.id);
                    else toast.info(`${name} a été supprimé`);
                  },
                },
              }
            : undefined,
        );
        return created;
      } catch (err) {
        freshToast('error', writeErrorMessage(err, 'save'));
        return null;
      } finally {
        busy.current.delete(key);
      }
    },
    [queryClient, stillListed],
  );

  const remove = useCallback<ProductActionsApi['remove']>(
    async (product, opts) => {
      // No dialog: the undo toast is the safety net (one tap fewer). A second
      // tap while the product is already waiting for its DELETE does nothing.
      opts?.onConfirmed?.();
      const ok = deleteWithUndo(queryClient, product);
      if (ok) opts?.beforeCacheUpdate?.();
      return ok;
    },
    [queryClient],
  );

  return { duplicate, remove };
}
