import { prisma } from '../config/database';
import { calculateRecipeMargin, RecipeWithCost, CreateRecipeInput } from '@margebar/shared';

function enrichRecipe(recipe: any): RecipeWithCost {
  const ingredients = recipe.ingredients || [];
  const consumables = recipe.consumables || [];
  const sellingPriceTTC = recipe.sellingPriceTTC;

  // Only compute margin if selling price is set and positive
  const computed = sellingPriceTTC && sellingPriceTTC > 0
    ? calculateRecipeMargin(ingredients, consumables, sellingPriceTTC, recipe.tvaRate)
    : {
        totalIngredientCost: ingredients.reduce((s: number, i: any) => s + (i.costPerUnit || 0), 0),
        totalConsumableCost: consumables.reduce((s: number, c: any) => s + (c.unitCost || 0) * (c.quantity || 1), 0),
        totalCostHT: 0,
        sellingPriceTTC: 0,
        sellingPriceHT: 0,
        marginHT: 0,
        marginPercent: 0,
        coefficient: 0,
        colorCode: 'red' as const,
      };

  // Recalculate totalCostHT for no-price case
  if (!sellingPriceTTC || sellingPriceTTC <= 0) {
    computed.totalCostHT = computed.totalIngredientCost + computed.totalConsumableCost;
  }

  return { ...recipe, computed };
}

const recipeInclude = {
  ingredients: {
    include: {
      product: {
        select: { id: true, name: true, purchasePriceHT: true, containerVolumeCl: true },
      },
    },
  },
  consumables: true,
};

export async function getRecipes(userId: string) {
  const recipes = await prisma.recipe.findMany({
    where: { userId },
    include: recipeInclude,
    orderBy: { updatedAt: 'desc' },
  });
  return recipes.map(enrichRecipe);
}

export async function getPublicRecipes() {
  const recipes = await prisma.recipe.findMany({
    where: { isPublic: true },
    include: recipeInclude,
    orderBy: { createdAt: 'desc' },
  });
  return recipes.map(enrichRecipe);
}

export async function getRecipe(id: string, userId: string) {
  const recipe = await prisma.recipe.findFirst({
    where: { id, OR: [{ userId }, { isPublic: true }] },
    include: recipeInclude,
  });
  if (!recipe) throw new Error('Recette non trouvée');
  return enrichRecipe(recipe);
}

export async function createRecipe(userId: string, data: CreateRecipeInput) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { businessName: true } });

  const recipe = await prisma.recipe.create({
    data: {
      userId,
      name: data.name,
      description: data.description ?? null,
      sellingPriceTTC: data.sellingPriceTTC ?? null,
      tvaRate: data.tvaRate,
      imageUrl: data.imageUrl ?? null,
      isPublic: data.isPublic ?? false,
      authorName: user?.businessName ?? null,
      ingredients: {
        create: data.ingredients.map((ing) => ({
          productId: ing.productId ?? null,
          name: ing.name,
          quantityCl: ing.quantityCl,
          costPerUnit: ing.costPerUnit,
        })),
      },
      consumables: {
        create: data.consumables.map((c) => ({
          name: c.name,
          unitCost: c.unitCost,
          quantity: c.quantity,
        })),
      },
    },
    include: recipeInclude,
  });

  return enrichRecipe(recipe);
}

export async function updateRecipe(id: string, userId: string, data: Partial<CreateRecipeInput>) {
  // Authorization: only owner can update
  const existing = await prisma.recipe.findFirst({ where: { id, userId } });
  if (!existing) throw new Error('Recette non trouvée');

  // Use transaction for atomic delete + recreate of ingredients/consumables
  const recipe = await prisma.$transaction(async (tx) => {
    if (data.ingredients) {
      await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
    }
    if (data.consumables) {
      await tx.recipeConsumable.deleteMany({ where: { recipeId: id } });
    }

    // Build update payload — only include provided fields
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.sellingPriceTTC !== undefined) updateData.sellingPriceTTC = data.sellingPriceTTC;
    if (data.tvaRate !== undefined) updateData.tvaRate = data.tvaRate;
    if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;
    if (data.isPublic !== undefined) updateData.isPublic = data.isPublic;

    if (data.ingredients) {
      updateData.ingredients = {
        create: data.ingredients.map((ing) => ({
          productId: ing.productId ?? null,
          name: ing.name,
          quantityCl: ing.quantityCl,
          costPerUnit: ing.costPerUnit,
        })),
      };
    }
    if (data.consumables) {
      updateData.consumables = {
        create: data.consumables.map((c) => ({
          name: c.name,
          unitCost: c.unitCost,
          quantity: c.quantity,
        })),
      };
    }

    return tx.recipe.update({
      where: { id },
      data: updateData,
      include: recipeInclude,
    });
  });

  return enrichRecipe(recipe);
}

export async function deleteRecipe(id: string, userId: string) {
  // Authorization: only owner can delete
  const existing = await prisma.recipe.findFirst({ where: { id, userId } });
  if (!existing) throw new Error('Recette non trouvée');
  await prisma.recipe.delete({ where: { id } });
}
