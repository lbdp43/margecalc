import type { QueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ProductWithMargin,
  CreateProductInput,
  ImportProductsInput,
  ImportProductsResult,
  BatchPriceSnapshot,
  BatchPriceUpdate,
  BatchPricesResult,
} from '@margebar/shared';
import { api } from './api';
import { assertOnline, clearCache, setCache, withoutFullPhoto } from './offline';
import { useAuthStore } from '../store/auth.store';

/**
 * Products API. Writes never queue offline: they throw an `OfflineError`
 * (readable French message) so the screen can say so instead of hanging or
 * creating a product with a fake id (RC6).
 *
 * Saving a product and ALL its services is one request: pass `servings`
 * inline to createProduct / updateProduct (applied atomically by the API).
 */

/** The admin « Tous les produits » list (Réglages): it shows every user's products. */
const ADMIN_PRODUCTS = ['admin', 'products'] as const;

/** Query keys shared by the list, the detail and the form. */
export const productKeys = {
  list: ['products'] as const,
  detail: (id: string) => ['product', id] as const,
  servings: (id: string) => ['productServings', id] as const,
  priceHistory: (id: string) => ['priceHistory', id] as const,
};

export async function getProducts(categoryId?: string): Promise<ProductWithMargin[]> {
  // A delete still in its undo window (or left unsent by a closed app) never reappears.
  await settleLeftoverDeletes();
  const params = categoryId ? { categoryId } : {};
  const res = await api.get<ProductWithMargin[]>('/products', { params });
  if (!categoryId) settleSentDeletes(res.data);
  return hiddenIds.size ? res.data.filter((p) => !hiddenIds.has(p.id)) : res.data;
}

export async function getProduct(id: string): Promise<ProductWithMargin> {
  const res = await api.get<ProductWithMargin>(`/products/${id}`);
  return res.data;
}

export async function createProduct(data: CreateProductInput): Promise<ProductWithMargin> {
  assertOnline();
  const res = await api.post<ProductWithMargin>('/products', data, { timeout: 30000 });
  return res.data;
}

export async function updateProduct(id: string, data: Partial<CreateProductInput>): Promise<ProductWithMargin> {
  assertOnline();
  const res = await api.put<ProductWithMargin>(`/products/${id}`, data, { timeout: 30000 });
  return res.data;
}

export async function deleteProduct(id: string): Promise<void> {
  assertOnline('Pas de connexion : le produit n’a pas été supprimé. Réessayez une fois connecté.');
  await api.delete(`/products/${id}`);
}

/**
 * Invoice import: `POST /api/products/import`. Each line is validated and
 * written on its own (per-line errors in `results`). When nothing could be
 * imported the API answers 422 with the same body: it is returned as is.
 */
export async function importProducts(input: ImportProductsInput): Promise<ImportProductsResult> {
  assertOnline('Pas de connexion : rien n’a été importé. Réessayez une fois connecté.');
  try {
    const res = await api.post<ImportProductsResult>('/products/import', input, { timeout: 60000 });
    return res.data;
  } catch (err: any) {
    const body = err?.response?.data;
    if (err?.response?.status === 422 && body && Array.isArray(body.results)) return body as ImportProductsResult;
    throw err;
  }
}

export interface PriceHistoryEntry {
  id: string;
  productId: string;
  oldPrice: number;
  newPrice: number;
  changedAt: string;
  source: string;
}

export async function getPriceHistory(productId: string): Promise<PriceHistoryEntry[]> {
  const res = await api.get<PriceHistoryEntry[]>(`/products/${productId}/price-history`);
  return res.data;
}

// ─── Batch prices (lot 2): POST /api/products/prices/batch ──────────────────
//
// One transaction for 1 to 200 products: « Appliquer », « Tout appliquer »
// (Sous l’objectif), the quick price sheet and the purchase price sheet. The
// response's `previous` posted back as is is the exact undo (pricing mode,
// dose, services, « À vérifier » flag): see `undoOf`.

export async function batchUpdatePrices(updates: BatchPriceUpdate[]): Promise<BatchPricesResult> {
  assertOnline('Pas de connexion : aucun prix n’a été modifié. Réessayez une fois connecté.');
  const res = await api.post<BatchPricesResult>('/products/prices/batch', { updates }, { timeout: 30000 });
  return res.data;
}

/** Most updates one POST /prices/batch accepts (« Trop de produits en une fois (200 maximum). »). */
export const BATCH_MAX = 200;

/**
 * Any number of updates, sent BATCH_MAX at a time, one batch after another
 * (« Tout appliquer » on a big catalogue). `products` and `previous` merge the
 * batches in order. When a later batch fails, the earlier ones stay written:
 * the result carries what they wrote plus `error` (the first batch's failure
 * is thrown, nothing was written).
 */
export async function batchUpdatePricesChunked(updates: BatchPriceUpdate[]): Promise<BatchPricesResult & { error?: unknown }> {
  if (updates.length <= BATCH_MAX) return batchUpdatePrices(updates);
  const out: BatchPricesResult = { products: [], previous: [] };
  for (let i = 0; i < updates.length; i += BATCH_MAX) {
    try {
      const r = await batchUpdatePrices(updates.slice(i, i + BATCH_MAX));
      out.products.push(...r.products);
      out.previous.push(...r.previous);
    } catch (error) {
      if (!out.products.length) throw error;
      return { ...out, error };
    }
  }
  return out;
}

/** « Annuler » of a batch: its `previous` snapshots, posted back as is. */
export function undoOf(previous: BatchPriceSnapshot[]): BatchPriceUpdate[] {
  return previous.map((p) => ({ ...p, servings: p.servings.map((s) => ({ ...s })) }));
}

/**
 * The products a batch returned, in every cache: the list entries replaced in
 * place (same order), each open detail merged (it keeps its full photo: batch
 * products carry no `imageUrl`), then everything that depends on them refetched.
 */
export function applyBatchProducts(queryClient: QueryClient, products: ProductWithMargin[]): void {
  if (!products.length) return;
  const byId = new Map(products.map((p) => [p.id, p]));
  queryClient.setQueryData<ProductWithMargin[]>(productKeys.list, (old) =>
    old ? old.map((p) => (byId.has(p.id) ? ({ ...p, ...byId.get(p.id) } as ProductWithMargin) : p)) : old,
  );
  for (const p of products) {
    queryClient.setQueryData<ProductWithMargin>(productKeys.detail(p.id), (old) => (old ? ({ ...old, ...p } as ProductWithMargin) : old));
    clearCache(JSON.stringify(productKeys.servings(p.id))).catch(() => {});
    queryClient.invalidateQueries({ queryKey: productKeys.detail(p.id) });
    queryClient.invalidateQueries({ queryKey: productKeys.servings(p.id) });
    queryClient.invalidateQueries({ queryKey: productKeys.priceHistory(p.id) });
  }
  queryClient.invalidateQueries({ queryKey: productKeys.list });
  queryClient.invalidateQueries({ queryKey: ADMIN_PRODUCTS });
}

// ─── Deferred deletes (lot 2 n° 11): « Aperol supprimé · Annuler » ──────────
//
// The product leaves every list at once; DELETE is only sent when the undo
// window closes (`commit`), or right away when the page / app is left
// (pagehide, visibilitychange, sign-out: a keepalive request). « Annuler »
// (`undo`) puts it back with no request at all.
//
// Backstop: pending ids are kept on the device (`margebar_pending_deletes`)
// until the server confirmed. One the page could not send (closed mid-window,
// expired token) is sent at the next launch, and stays hidden meanwhile.

const PENDING_DELETES_KEY = 'margebar_pending_deletes';
/** A leftover older than this is forgotten (and shows again if it still exists). */
const LEFTOVER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface PendingDeleteEntry {
  id: string;
  name: string;
  userId: string | null;
  at: number;
  /**
   * When a page being left sent it (keepalive): its answer may never be read.
   * The next launch does not send it again (a second DELETE, a 404): the
   * full list tells whether it went through (see `settleSentDeletes`).
   */
  sentAt?: number;
}
/** A keepalive DELETE not confirmed by the list after this long is sent again. */
const SENT_RETRY_AFTER_MS = 8000;

/** Deletes in their undo window (this session), with what is needed to put the product back. */
const pending = new Map<string, { entry: PendingDeleteEntry; snapshot?: ProductWithMargin; index: number }>();
/** Ids saved on the device until the server confirmed the DELETE. */
let stored = new Map<string, PendingDeleteEntry>();
/** Ids that every product list leaves out. */
const hiddenIds = new Set<string>();
let storeLoaded: Promise<void> | null = null;
let leftoversDone: Promise<void> | null = null;
let leftoversFor: string | null = null;

function loadStore(): Promise<void> {
  if (!storeLoaded) {
    storeLoaded = AsyncStorage.getItem(PENDING_DELETES_KEY)
      .then((raw) => {
        const list = raw ? (JSON.parse(raw) as PendingDeleteEntry[]) : [];
        for (const e of Array.isArray(list) ? list : []) {
          if (!e || typeof e.id !== 'string') continue;
          if (Date.now() - (e.at || 0) > LEFTOVER_MAX_AGE_MS) continue;
          // An entry written this session (before the read finished) wins.
          if (!stored.has(e.id)) stored.set(e.id, e);
        }
        for (const [id, e] of stored) if (e.userId === currentUserId()) hiddenIds.add(id);
      })
      .catch(() => {});
  }
  return storeLoaded;
}

function saveStore() {
  AsyncStorage.setItem(PENDING_DELETES_KEY, JSON.stringify(Array.from(stored.values()))).catch(() => {});
}

function forgetStored(id: string) {
  if (stored.delete(id)) saveStore();
  if (!pending.has(id)) hiddenIds.delete(id);
}

const currentUserId = (): string | null => useAuthStore.getState().user?.id ?? null;

/** DELETE that survives the page being closed (web keepalive). Resolves true when the server confirmed. */
async function sendDelete(id: string, token: string | null, keepalive: boolean): Promise<boolean> {
  if (!keepalive) {
    try {
      await api.delete(`/products/${id}`);
      return true;
    } catch (err: any) {
      if (err?.response?.status === 404) return true; // already gone (deleted elsewhere)
      throw err;
    }
  }
  try {
    const base = api.defaults.baseURL ?? '/api';
    const res = await fetch(`${base}/products/${id}`, {
      method: 'DELETE',
      keepalive: true,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    } as RequestInit);
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/** Once per account and session, before the first list: send the deletes a closed app left behind. */
function settleLeftoverDeletes(): Promise<void> {
  const me = currentUserId();
  if (!leftoversDone || leftoversFor !== me) {
    leftoversFor = me;
    leftoversDone = loadStore().then(async () => {
      const mine = Array.from(stored.values()).filter((e) => e.userId === me && !pending.has(e.id));
      for (const e of mine) {
        hiddenIds.add(e.id);
        // Sent by the page that was left: the list will say (settleSentDeletes).
        if (e.sentAt) continue;
        try {
          if (await sendDelete(e.id, null, false)) forgetStored(e.id);
        } catch {
          // Still unreachable: kept hidden, tried again at the next launch.
        }
      }
    });
  }
  return leftoversDone;
}

/**
 * Every product of the account (GET /products without a category) just came
 * back: a delete a left page sent (keepalive) is confirmed when its product
 * is not in it any more; still there after SENT_RETRY_AFTER_MS, it is sent again.
 */
function settleSentDeletes(list: ProductWithMargin[]) {
  const me = currentUserId();
  const sent = Array.from(stored.values()).filter((e) => e.sentAt && e.userId === me && !pending.has(e.id));
  if (!sent.length) return;
  const present = new Set(list.map((p) => p.id));
  for (const e of sent) {
    if (!present.has(e.id)) {
      forgetStored(e.id);
    } else if (Date.now() - (e.sentAt ?? 0) > SENT_RETRY_AFTER_MS) {
      e.sentAt = undefined;
      saveStore();
      sendDelete(e.id, null, false)
        .then((ok) => ok && forgetStored(e.id))
        .catch(() => {});
    }
  }
}

/** A keepalive DELETE for a page being left: marked sent on the device first (synchronous on web). */
function sendOnLeave(id: string, token: string | null) {
  const e = stored.get(id);
  if (e) {
    e.sentAt = Date.now();
    saveStore();
  }
  // Kept hidden and stored until the server confirmed (else: the next launch's list).
  sendDelete(id, token, true).then((ok) => ok && forgetStored(id));
}

/** The page / app is being left (or the user signs out): send every pending delete now. */
export function flushPendingDeletes(token: string | null = useAuthStore.getState().token) {
  if (!pending.size) return;
  const ids = Array.from(pending.keys());
  pending.clear();
  for (const id of ids) sendOnLeave(id, token);
}

if (Platform.OS === 'web') {
  const w: any = (globalThis as any).window;
  const d: any = (globalThis as any).document;
  w?.addEventListener?.('pagehide', () => flushPendingDeletes());
  d?.addEventListener?.('visibilitychange', () => {
    if (d.visibilityState === 'hidden') flushPendingDeletes();
  });
}
useAuthStore.subscribe((state, prev) => {
  // Signing out: the token is about to go, send with the one still known.
  if (prev.token && !state.token) flushPendingDeletes(prev.token);
});

const pageHidden = () => Platform.OS === 'web' && (globalThis as any).document?.visibilityState === 'hidden';

export interface DeferredDelete {
  /** « Annuler »: back in the list, no request. False when it is too late (already sent). */
  undo: () => boolean;
  /**
   * The window closed: send DELETE. Resolves 'deleted' (or 'noop' when it was
   * undone or already sent). On failure the product is put back and the error
   * is thrown (show it as is).
   */
  commit: () => Promise<'deleted' | 'noop'>;
}

/** True while a product is waiting for its DELETE (undo window, or left unsent). */
export function isDeletePending(id: string): boolean {
  return hiddenIds.has(id);
}

function putBack(queryClient: QueryClient, snapshot: ProductWithMargin | undefined, index: number) {
  if (snapshot) {
    queryClient.setQueryData<ProductWithMargin[]>(productKeys.list, (old) => {
      if (!old || old.some((p) => p.id === snapshot.id)) return old;
      const next = [...old];
      next.splice(Math.max(0, Math.min(index, next.length)), 0, snapshot);
      return next;
    });
  }
  queryClient.invalidateQueries({ queryKey: productKeys.list });
}

/**
 * Soft delete: the product disappears from every list now, DELETE waits for
 * `commit()`. Offline is refused by the caller first (nothing to defer to).
 */
export function deferProductDelete(queryClient: QueryClient, product: { id: string; name: string }): DeferredDelete {
  const { id } = product;
  const list = queryClient.getQueryData<ProductWithMargin[]>(productKeys.list);
  const index = list ? list.findIndex((p) => p.id === id) : -1;
  const entry: PendingDeleteEntry = { id, name: product.name, userId: currentUserId(), at: Date.now() };
  pending.set(id, { entry, snapshot: index >= 0 ? list![index] : undefined, index });
  hiddenIds.add(id);
  stored.set(id, entry);
  saveStore();
  loadStore();
  queryClient.setQueryData<ProductWithMargin[]>(productKeys.list, (old) => (old ? old.filter((p) => p.id !== id) : old));

  return {
    undo: () => {
      const p = pending.get(id);
      if (!p) return false;
      pending.delete(id);
      hiddenIds.delete(id);
      forgetStored(id);
      putBack(queryClient, p.snapshot, p.index);
      return true;
    },
    commit: async () => {
      const p = pending.get(id);
      if (!p) return 'noop';
      pending.delete(id);
      if (pageHidden()) {
        // Leaving: a keepalive request; confirmed (or retried) like a flush.
        sendOnLeave(id, useAuthStore.getState().token);
        forgetProduct(queryClient, id);
        return 'deleted';
      }
      try {
        await sendDelete(id, null, false);
      } catch (err) {
        hiddenIds.delete(id);
        forgetStored(id);
        putBack(queryClient, p.snapshot, p.index);
        throw err;
      }
      forgetStored(id);
      forgetProduct(queryClient, id);
      clearCache(JSON.stringify(productKeys.priceHistory(id))).catch(() => {});
      return 'deleted';
    },
  };
}

/**
 * After a save: put the fresh product in the cache (the detail shows it at once)
 * and refetch everything that depends on it (RC3). The full photo (`imageUrl`,
 * up to 300 000 chars) lives in memory in ['product', id] only: the offline
 * copy keeps the thumbnail and `hasImage`, and the list is refetched, never
 * written with it (GET /api/products has no `imageUrl`).
 */
export function refreshProductCaches(queryClient: QueryClient, saved: ProductWithMargin): void {
  const id = saved.id;
  queryClient.setQueryData(productKeys.detail(id), saved);
  setCache(JSON.stringify(productKeys.detail(id)), withoutFullPhoto(saved)).catch(() => {});
  clearCache(JSON.stringify(productKeys.servings(id))).catch(() => {});
  queryClient.invalidateQueries({ queryKey: productKeys.list });
  queryClient.invalidateQueries({ queryKey: productKeys.detail(id) });
  queryClient.invalidateQueries({ queryKey: productKeys.servings(id) });
  queryClient.invalidateQueries({ queryKey: productKeys.priceHistory(id) });
  queryClient.invalidateQueries({ queryKey: ADMIN_PRODUCTS });
}

/** The device's offline copies of a product the server no longer has (a 404). */
export function dropOfflineProduct(id: string): void {
  clearCache(JSON.stringify(productKeys.detail(id))).catch(() => {});
  clearCache(JSON.stringify(productKeys.servings(id))).catch(() => {});
  clearCache(JSON.stringify(productKeys.priceHistory(id))).catch(() => {});
}

/** After a delete: drop every cached trace of the product, then refetch the lists (RC7). */
export function forgetProduct(queryClient: QueryClient, id: string): void {
  queryClient.removeQueries({ queryKey: productKeys.detail(id) });
  queryClient.removeQueries({ queryKey: productKeys.servings(id) });
  queryClient.removeQueries({ queryKey: productKeys.priceHistory(id) });
  clearCache(JSON.stringify(productKeys.detail(id))).catch(() => {});
  clearCache(JSON.stringify(productKeys.servings(id))).catch(() => {});
  queryClient.invalidateQueries({ queryKey: productKeys.list });
  queryClient.invalidateQueries({ queryKey: ADMIN_PRODUCTS });
}
