export enum MarginMode {
  FIX_SELLING_PRICE = 'fix_selling_price',
  FIX_TARGET_MARGIN = 'fix_target_margin',
  FIX_COEFFICIENT = 'fix_coefficient',
}

export const TVA_RATES = {
  RATE_20: 0.20,
  RATE_10: 0.10,
  RATE_5_5: 0.055,
  DISABLED: 0,
} as const;

export type TVARate = (typeof TVA_RATES)[keyof typeof TVA_RATES];

export interface Product {
  id: string;
  userId: string;
  categoryId: string;
  name: string;
  purchasePriceHT: number;
  containerVolumeCl: number;
  doseVolumeCl: number;
  marginMode: MarginMode;
  sellingPriceTTC: number | null;
  targetMarginPercent: number | null;
  coefficient: number | null;
  tvaRate: number;
  supplier: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductWithMargin extends Product {
  computed: MarginResult;
}

export interface MarginInput {
  purchasePriceHT: number;
  containerVolumeCl: number;
  doseVolumeCl: number;
  marginMode: MarginMode;
  sellingPriceTTC?: number;
  targetMarginPercent?: number;
  coefficient?: number;
  tvaRate: number;
}

export interface MarginResult {
  sellingPriceTTC: number;
  sellingPriceHT: number;
  marginPercent: number;
  coefficient: number;
  glassesPerContainer: number;
  costPerDoseHT: number;
  marginPerDoseHT: number;
  revenuePerContainer: number;
  marginPerContainer: number;
  colorCode: 'green' | 'orange' | 'red';
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  sortOrder: number;
}

export interface CreateProductInput {
  name: string;
  categoryId: string;
  purchasePriceHT: number;
  containerVolumeCl: number;
  doseVolumeCl: number;
  marginMode: MarginMode;
  sellingPriceTTC?: number;
  targetMarginPercent?: number;
  coefficient?: number;
  tvaRate: number;
  supplier?: string;
}
