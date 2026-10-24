import { api } from './api';
import { ServingType, CreateServingTypeInput, ServingMarginResult } from '@margebar/shared';
import { assertOnline } from './offline';

export async function getServingTypes(): Promise<ServingType[]> {
  const res = await api.get<ServingType[]>('/servings');
  return res.data;
}

export async function createServingType(data: CreateServingTypeInput): Promise<ServingType> {
  assertOnline();
  const res = await api.post<ServingType>('/servings', data);
  return res.data;
}

export async function updateServingType(id: string, data: Partial<CreateServingTypeInput>): Promise<ServingType> {
  assertOnline();
  const res = await api.put<ServingType>(`/servings/${id}`, data);
  return res.data;
}

export async function deleteServingType(id: string): Promise<void> {
  assertOnline();
  await api.delete(`/servings/${id}`);
}

/**
 * Replaces the product's FULL set of services (those not sent are deleted) and
 * re-syncs the product's headline price/dose to the primary service.
 * Prefer sending `servings` inline with the product (product.service) so both
 * are saved in one request.
 */
export async function upsertProductServings(
  productId: string,
  servings: { servingTypeId: string; sellingPriceTTC: number }[],
): Promise<ServingMarginResult[]> {
  assertOnline();
  const res = await api.put<ServingMarginResult[]>(`/products/${productId}/servings`, { servings });
  return res.data;
}
