import { api } from './api';
import { Category } from '@margebar/shared';
import { assertOnline } from './offline';

/** Built-in categories plus the user's own (`GET /api/categories`). */
export async function getCategories(): Promise<Category[]> {
  const res = await api.get<Category[]>('/categories');
  return res.data;
}

/** Creates a private category (409 when the name already exists). */
export async function createCategory(name: string): Promise<Category> {
  assertOnline();
  const res = await api.post<Category>('/categories', { name });
  return res.data;
}
