import { prisma } from '../config/database';
import { calculateRecipeMargin, RecipeWithCost, CreateRecipeInput } from '@margebar/shared';

function enrichRecipe(recipe: any): RecipeWithCost {
  const ingredients = recipe.ingredients || [];
  const consumables = recipe.consumables || [];
  const sellingPriceTTC = recipe.sellingPriceTTC || 0;

  const computed = calculateRecipeMargin(
    ingredients,
    consumables,
    sellingPriceTTC,
    recipe.tvaRate,
  );

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
  const existing = await prisma.recipe.findFirst({ where: { id, userId } });
  if (!existing) throw new Error('Recette non trouvée');

  // Delete old ingredients/consumables if new ones provided
  if (data.ingredients) {
    await prisma.recipeIngredient.deleteMany({ where: { recipeId: id } });
  }
  if (data.consumables) {
    await prisma.recipeConsumable.deleteMany({ where: { recipeId: id } });
  }

  const recipe = await prisma.recipe.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      sellingPriceTTC: data.sellingPriceTTC,
      tvaRate: data.tvaRate,
      imageUrl: data.imageUrl,
      isPublic: data.isPublic,
      ...(data.ingredients ? {
        ingredients: {
          create: data.ingredients.map((ing) => ({
            productId: ing.productId ?? null,
            name: ing.name,
            quantityCl: ing.quantityCl,
            costPerUnit: ing.costPerUnit,
          })),
        },
      } : {}),
      ...(data.consumables ? {
        consumables: {
          create: data.consumables.map((c) => ({
            name: c.name,
            unitCost: c.unitCost,
            quantity: c.quantity,
          })),
        },
      } : {}),
    },
    include: recipeInclude,
  });

  return enrichRecipe(recipe);
}

export async function deleteRecipe(id: string, userId: string) {
  const existing = await prisma.recipe.findFirst({ where: { id, userId } });
  if (!existing) throw new Error('Recette non trouvée');
  await prisma.recipe.delete({ where: { id } });
}
