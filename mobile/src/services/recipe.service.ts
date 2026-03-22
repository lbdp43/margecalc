import { api } from './api';
import { RecipeWithCost, CreateRecipeInput } from '@margebar/shared';
import { isOnline, queueOperation } from './offline';

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
  if (!isOnline()) {
    await queueOperation('POST', '/recipes', data);
    return {
      ...data,
      id: `offline-${Date.now()}`,
      userId: '',
      description: data.description ?? null,
      sellingPriceTTC: data.sellingPriceTTC ?? null,
      imageUrl: data.imageUrl ?? null,
      isPublic: data.isPublic ?? false,
      authorName: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ingredients: data.ingredients.map((i, idx) => ({
        id: `offline-ing-${idx}`,
        recipeId: '',
        productId: i.productId ?? null,
        name: i.name,
        quantityCl: i.quantityCl,
        costPerUnit: i.costPerUnit,
      })),
      consumables: data.consumables.map((c, idx) => ({
        id: `offline-con-${idx}`,
        recipeId: '',
        name: c.name,
        unitCost: c.unitCost,
        quantity: c.quantity,
      })),
      computed: {
        totalIngredientCost: 0, totalConsumableCost: 0, totalCostHT: 0,
        sellingPriceTTC: 0, sellingPriceHT: 0, marginHT: 0,
        marginPercent: 0, coefficient: 0, colorCode: 'red',
      },
    } as RecipeWithCost;
  }
  const res = await api.post<RecipeWithCost>('/recipes', data);
  return res.data;
}

export async function updateRecipe(id: string, data: Partial<CreateRecipeInput>): Promise<RecipeWithCost> {
  if (!isOnline()) {
    await queueOperation('PUT', `/recipes/${id}`, data);
    return { id, ...data } as any;
  }
  const res = await api.put<RecipeWithCost>(`/recipes/${id}`, data);
  return res.data;
}

export async function deleteRecipe(id: string): Promise<void> {
  if (!isOnline()) {
    await queueOperation('DELETE', `/recipes/${id}`);
    return;
  }
  await api.delete(`/recipes/${id}`);
}
