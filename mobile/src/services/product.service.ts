import { api } from './api';
import { ProductWithMargin, CreateProductInput } from '@margebar/shared';
import { isOnline, queueOperation } from './offline';

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
  if (!isOnline()) {
    await queueOperation('POST', '/products', data);
    // Return optimistic placeholder
    return {
      ...data,
      id: `offline-${Date.now()}`,
      userId: '',
      sellingPriceTTC: data.sellingPriceTTC ?? null,
      targetMarginPercent: data.targetMarginPercent ?? null,
      coefficient: data.coefficient ?? null,
      alcoholDegree: data.alcoholDegree ?? 0,
      supplier: data.supplier ?? null,
      imageUrl: data.imageUrl ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      computed: {
        sellingPriceTTC: 0, sellingPriceHT: 0, marginPercent: 0,
        coefficient: 0, glassesPerContainer: 0, costPerDoseHT: 0,
        marginPerDoseHT: 0, revenuePerContainer: 0, marginPerContainer: 0,
        colorCode: 'red',
      },
    } as ProductWithMargin;
  }
  const res = await api.post<ProductWithMargin>('/products', data);
  return res.data;
}

export async function updateProduct(id: string, data: Partial<CreateProductInput>): Promise<ProductWithMargin> {
  if (!isOnline()) {
    await queueOperation('PUT', `/products/${id}`, data);
    // Return data as-is, will sync later
    return { id, ...data } as any;
  }
  const res = await api.put<ProductWithMargin>(`/products/${id}`, data);
  return res.data;
}

export async function deleteProduct(id: string): Promise<void> {
  if (!isOnline()) {
    await queueOperation('DELETE', `/products/${id}`);
    return;
  }
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
