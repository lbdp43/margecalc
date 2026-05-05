// --- Cocktail / Recipe types ---

export interface Recipe {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  sellingPriceTTC: number | null;
  tvaRate: number;
  imageUrl: string | null;
  isPublic: boolean;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredient {
  id: string;
  recipeId: string;
  productId: string | null;
  name: string;
  quantityCl: number;
  costPerUnit: number; // cost in € for this ingredient's quantity
  product?: {
    id: string;
    name: string;
    purchasePriceHT: number;
    containerVolumeCl: number;
  } | null;
}

export interface RecipeConsumable {
  id: string;
  recipeId: string;
  name: string;
  unitCost: number;
  quantity: number;
}

export interface RecipeWithCost extends Recipe {
  ingredients: RecipeIngredient[];
  consumables: RecipeConsumable[];
  computed: RecipeMarginResult;
}

export interface RecipeMarginResult {
  totalIngredientCost: number;
  totalConsumableCost: number;
  totalCostHT: number;
  sellingPriceTTC: number;
  sellingPriceHT: number;
  marginHT: number;
  marginPercent: number;
  coefficient: number;
  colorCode: 'green' | 'orange' | 'red';
}

export interface CreateRecipeInput {
  name: string;
  description?: string;
  sellingPriceTTC?: number;
  tvaRate: number;
  imageUrl?: string;
  isPublic?: boolean;
  ingredients: CreateRecipeIngredientInput[];
  consumables: CreateRecipeConsumableInput[];
}

export interface CreateRecipeIngredientInput {
  productId?: string;
  name: string;
  quantityCl: number;
  costPerUnit: number;
}

export interface CreateRecipeConsumableInput {
  name: string;
  unitCost: number;
  quantity: number;
}
