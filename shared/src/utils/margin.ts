import { MarginInput, MarginMode, MarginResult, ServingType, ServingMarginResult } from '../types/product';
import { RecipeIngredient, RecipeConsumable, RecipeMarginResult } from '../types/recipe';
import { getMarginColor } from '../constants/colors';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function glassesPerContainer(containerCl: number, doseCl: number): number {
  if (doseCl <= 0) throw new Error('Dose must be > 0');
  if (containerCl <= 0) throw new Error('Container volume must be > 0');
  return containerCl / doseCl;
}

export function costPerDose(purchasePriceHT: number, glasses: number): number {
  if (glasses <= 0) throw new Error('Glasses count must be > 0');
  return purchasePriceHT / glasses;
}

export function clToL(cl: number): number {
  return cl / 100;
}

export function lToCl(l: number): number {
  return l * 100;
}

/**
 * Calculate alcohol tax for a container.
 * @param containerVolumeCl - Volume of the container in centiliters
 * @param alcoholDegree - Alcohol percentage (e.g. 40 for 40%)
 * @param droitAccise - Excise duty rate in €/hlAP (hectoliter of pure alcohol)
 * @param cotisationSecu - Social security rate in €/hlAP
 * @returns Tax amount in euros for the container
 */
export function calculateAlcoholTax(
  containerVolumeCl: number,
  alcoholDegree: number,
  droitAccise: number,
  cotisationSecu: number,
): number {
  if (alcoholDegree <= 0 || containerVolumeCl <= 0) return 0;
  const volumeHl = containerVolumeCl / 10000; // cl to hectoliters
  const pureAlcoholHl = volumeHl * (alcoholDegree / 100);
  return round2(pureAlcoholHl * (droitAccise + cotisationSecu));
}

export function calculateMargin(input: MarginInput): MarginResult {
  const { purchasePriceHT, containerVolumeCl, doseVolumeCl, marginMode, tvaRate } = input;

  if (purchasePriceHT < 0) throw new Error('Purchase price must be >= 0');
  if (containerVolumeCl <= 0) throw new Error('Container volume must be > 0');
  if (doseVolumeCl <= 0) throw new Error('Dose volume must be > 0');

  const glasses = glassesPerContainer(containerVolumeCl, doseVolumeCl);
  const doseCost = costPerDose(purchasePriceHT, glasses);

  let sellingPriceHT: number;
  let sellingPriceTTC: number;
  let marginPercent: number;
  let coefficient: number;

  switch (marginMode) {
    case MarginMode.FIX_SELLING_PRICE: {
      const priceTTC = input.sellingPriceTTC;
      if (priceTTC === undefined || priceTTC <= 0) {
        throw new Error('Selling price TTC is required and must be > 0');
      }
      sellingPriceTTC = priceTTC;
      sellingPriceHT = sellingPriceTTC / (1 + tvaRate);
      coefficient = doseCost > 0 ? sellingPriceHT / doseCost : 0;
      marginPercent = sellingPriceHT > 0
        ? ((sellingPriceHT - doseCost) / sellingPriceHT) * 100
        : 0;
      break;
    }

    case MarginMode.FIX_TARGET_MARGIN: {
      const targetMargin = input.targetMarginPercent;
      if (targetMargin === undefined || targetMargin === null || targetMargin < 0 || targetMargin >= 100) {
        throw new Error('Target margin must be defined and between 0 and 100%');
      }
      marginPercent = targetMargin;
      sellingPriceHT = doseCost / (1 - targetMargin / 100);
      sellingPriceTTC = sellingPriceHT * (1 + tvaRate);
      coefficient = doseCost > 0 ? sellingPriceHT / doseCost : 0;
      break;
    }

    case MarginMode.FIX_COEFFICIENT: {
      const coeff = input.coefficient;
      if (coeff === undefined || coeff <= 0) {
        throw new Error('Coefficient is required and must be > 0');
      }
      coefficient = coeff;
      sellingPriceHT = doseCost * coefficient;
      sellingPriceTTC = sellingPriceHT * (1 + tvaRate);
      marginPercent = sellingPriceHT > 0
        ? ((sellingPriceHT - doseCost) / sellingPriceHT) * 100
        : 0;
      break;
    }

    default:
      throw new Error(`Unknown margin mode: ${marginMode}`);
  }

  const marginPerDoseHT = sellingPriceHT - doseCost;
  const revenuePerContainer = sellingPriceTTC * glasses;
  const marginPerContainer = marginPerDoseHT * glasses;

  return {
    sellingPriceTTC: round2(sellingPriceTTC),
    sellingPriceHT: round2(sellingPriceHT),
    marginPercent: round2(marginPercent),
    coefficient: round2(coefficient),
    glassesPerContainer: round2(glasses),
    costPerDoseHT: round2(doseCost),
    marginPerDoseHT: round2(marginPerDoseHT),
    revenuePerContainer: round2(revenuePerContainer),
    marginPerContainer: round2(marginPerContainer),
    colorCode: getMarginColor(marginPercent),
  };
}

/**
 * Calculate margin for a specific serving type.
 * Given a product's purchase price and container volume,
 * and a serving type with its selling price TTC.
 */
export function calculateServingMargin(
  purchasePriceHT: number,
  containerVolumeCl: number,
  tvaRate: number,
  servingType: ServingType,
  sellingPriceTTC: number,
): ServingMarginResult {
  if (purchasePriceHT < 0) throw new Error('Purchase price must be >= 0');
  if (sellingPriceTTC <= 0) throw new Error('Selling price must be > 0');
  if (servingType.volumeCl <= 0) throw new Error('Serving volume must be > 0');
  if (containerVolumeCl <= 0) throw new Error('Container volume must be > 0');
  if (tvaRate < 0 || tvaRate >= 1) throw new Error('TVA rate must be between 0 and 1');
  const servingsPerContainer = containerVolumeCl / servingType.volumeCl;
  const costPerServingHT = purchasePriceHT / servingsPerContainer;
  const sellingPriceHT = sellingPriceTTC / (1 + tvaRate);
  const marginPerServingHT = sellingPriceHT - costPerServingHT;
  const marginPercent = sellingPriceHT > 0
    ? ((sellingPriceHT - costPerServingHT) / sellingPriceHT) * 100
    : 0;
  const revenuePerContainer = sellingPriceTTC * servingsPerContainer;
  const marginPerContainer = marginPerServingHT * servingsPerContainer;

  return {
    servingType,
    sellingPriceTTC: round2(sellingPriceTTC),
    sellingPriceHT: round2(sellingPriceHT),
    servingsPerContainer: round2(servingsPerContainer),
    costPerServingHT: round2(costPerServingHT),
    marginPerServingHT: round2(marginPerServingHT),
    marginPercent: round2(marginPercent),
    revenuePerContainer: round2(revenuePerContainer),
    marginPerContainer: round2(marginPerContainer),
    colorCode: getMarginColor(marginPercent),
  };
}

/**
 * Calculate margin for a cocktail/recipe.
 */
export function calculateRecipeMargin(
  ingredients: RecipeIngredient[],
  consumables: RecipeConsumable[],
  sellingPriceTTC: number,
  tvaRate: number,
): RecipeMarginResult {
  if (sellingPriceTTC <= 0) throw new Error('Selling price must be > 0');
  if (tvaRate < 0 || tvaRate >= 1) throw new Error('TVA rate must be between 0 and 1');

  // Sum raw values first, then round the totals (avoids cumulative rounding drift)
  const totalIngredientCost = round2(ingredients.reduce((sum, ing) => sum + ing.costPerUnit, 0));
  const totalConsumableCost = round2(consumables.reduce((sum, c) => sum + c.unitCost * c.quantity, 0));
  const totalCostHT = totalIngredientCost + totalConsumableCost;

  const sellingPriceHT = sellingPriceTTC / (1 + tvaRate);
  const marginHT = sellingPriceHT - totalCostHT;
  const marginPercent = sellingPriceHT > 0
    ? ((sellingPriceHT - totalCostHT) / sellingPriceHT) * 100
    : 0;
  const coefficient = totalCostHT > 0 ? sellingPriceHT / totalCostHT : 0;

  return {
    totalIngredientCost: round2(totalIngredientCost),
    totalConsumableCost: round2(totalConsumableCost),
    totalCostHT: round2(totalCostHT),
    sellingPriceTTC: round2(sellingPriceTTC),
    sellingPriceHT: round2(sellingPriceHT),
    marginHT: round2(marginHT),
    marginPercent: round2(marginPercent),
    coefficient: round2(coefficient),
    colorCode: getMarginColor(marginPercent),
  };
}
