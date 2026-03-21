import { api } from './api';
import { ServingType, CreateServingTypeInput, ServingMarginResult } from '@margebar/shared';

export async function getServingTypes(): Promise<ServingType[]> {
  const res = await api.get<ServingType[]>('/servings');
  return res.data;
}

export async function createServingType(data: CreateServingTypeInput): Promise<ServingType> {
  const res = await api.post<ServingType>('/servings', data);
  return res.data;
}

export async function updateServingType(id: string, data: Partial<CreateServingTypeInput>): Promise<ServingType> {
  const res = await api.put<ServingType>(`/servings/${id}`, data);
  return res.data;
}

export async function deleteServingType(id: string): Promise<void> {
  await api.delete(`/servings/${id}`);
}

export async function getProductServings(productId: string): Promise<ServingMarginResult[]> {
  const res = await api.get<ServingMarginResult[]>(`/products/${productId}/servings`);
  return res.data;
}

export async function upsertProductServings(
  productId: string,
  servings: { servingTypeId: string; sellingPriceTTC: number }[],
): Promise<ServingMarginResult[]> {
  const res = await api.put<ServingMarginResult[]>(`/products/${productId}/servings`, { servings });
  return res.data;
}
