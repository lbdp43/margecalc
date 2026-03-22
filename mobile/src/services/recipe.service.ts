import { api } from './api';
import { RecipeWithCost, CreateRecipeInput } from '@margebar/shared';

export async function getRecipes(): Promise<RecipeWithCost[]> {
  const res = await api.get<RecipeWithCost[]>('/recipes');
  return res.data;
}

export async function getCommunityRecipes(): Promise<RecipeWithCost[]> {
  const res = await api.get<RecipeWithCost[]>('/recipes/community');
  return res.data;
}

export async function getRecipe(id: string): Promise<RecipeWithCost> {
  const res = await api.get<RecipeWithCost>(`/recipes/${id}`);
  return res.data;
}

export async function createRecipe(data: CreateRecipeInput): Promise<RecipeWithCost> {
  const res = await api.post<RecipeWithCost>('/recipes', data);
  return res.data;
}

export async function updateRecipe(id: string, data: Partial<CreateRecipeInput>): Promise<RecipeWithCost> {
  const res = await api.put<RecipeWithCost>(`/recipes/${id}`, data);
  return res.data;
}

export async function deleteRecipe(id: string): Promise<void> {
  await api.delete(`/recipes/${id}`);
}
