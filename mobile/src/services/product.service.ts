import { api } from './api';
import { ProductWithMargin, CreateProductInput } from '@margebar/shared';

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
  const res = await api.post<ProductWithMargin>('/products', data);
  return res.data;
}

export async function updateProduct(id: string, data: Partial<CreateProductInput>): Promise<ProductWithMargin> {
  const res = await api.put<ProductWithMargin>(`/products/${id}`, data);
  return res.data;
}

export async function deleteProduct(id: string): Promise<void> {
  await api.delete(`/products/${id}`);
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
