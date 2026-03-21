import { api } from './api';
import { Category } from '@margebar/shared';

export async function getCategories(): Promise<Category[]> {
  const res = await api.get<Category[]>('/categories');
  return res.data;
}
