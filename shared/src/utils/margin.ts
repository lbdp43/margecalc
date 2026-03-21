import { MarginInput, MarginMode, MarginResult } from '../types/product';
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
      if (targetMargin === undefined || targetMargin >= 100) {
        throw new Error('Target margin must be defined and < 100%');
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
