import type { QueryClient } from '@tanstack/react-query';
import {
  ProductWithMargin,
  CreateProductInput,
  ImportProductsInput,
  ImportProductsResult,
} from '@margebar/shared';
import { api } from './api';
import { assertOnline, clearCache, setCache } from './offline';

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
  const params = categoryId ? { categoryId } : {};
  const res = await api.get<ProductWithMargin[]>('/products', { params });
  return res.data;
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

/**
 * After a save: put the fresh product in the cache (the detail shows it at once)
 * and refetch everything that depends on it (RC3). The persisted offline copy
 * keeps the thumbnail only (see offline.ts setCache).
 */
export function refreshProductCaches(queryClient: QueryClient, saved: ProductWithMargin): void {
  const id = saved.id;
  queryClient.setQueryData(productKeys.detail(id), saved);
  setCache(JSON.stringify(productKeys.detail(id)), saved).catch(() => {});
  clearCache(JSON.stringify(productKeys.servings(id))).catch(() => {});
  queryClient.invalidateQueries({ queryKey: productKeys.list });
  queryClient.invalidateQueries({ queryKey: productKeys.detail(id) });
  queryClient.invalidateQueries({ queryKey: productKeys.servings(id) });
  queryClient.invalidateQueries({ queryKey: productKeys.priceHistory(id) });
  queryClient.invalidateQueries({ queryKey: ADMIN_PRODUCTS });
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
