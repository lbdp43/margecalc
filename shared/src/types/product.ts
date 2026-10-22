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
  alcoholDegree: number;
  supplier: string | null;
  /**
   * Full product photo (data URI `data:image/(jpeg|png|webp);base64,…`, ≤ 300 000 chars, ~640 px).
   * Only returned by `GET /api/products/:id` (and create/update responses).
   * NOT returned by the list `GET /api/products` (use `thumbnailUrl` / `hasImage` there).
   */
  imageUrl?: string | null;
  /** Small photo (data URI, ≤ 40 000 chars, ~160 px). Returned by the list and the detail. */
  thumbnailUrl: string | null;
  /** True when the product has a full photo (list responses only). */
  hasImage?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductWithMargin extends Product {
  computed: MarginResult;
  servings?: ProductServing[];
  category?: Category;
  /**
   * `PUT /api/products/:id` only, when the product has services: the headline fields the body
   * sent that were NOT applied, because a product with services is priced by its primary
   * service (lowest sortOrder). Send `servings` in the same PUT to change the price/dose.
   */
  ignoredFields?: Array<'sellingPriceTTC' | 'doseVolumeCl' | 'marginMode'>;
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
  /** null = built-in category shared by every account; otherwise private to that user. */
  userId?: string | null;
  name: string;
  slug: string;
  icon: string;
  sortOrder: number;
}

/**
 * Body of `POST /api/products` and (all fields optional) `PUT /api/products/:id`.
 *
 * Products with services (`servings`): the headline `sellingPriceTTC`, `doseVolumeCl` and
 * `marginMode` always mirror the PRIMARY service (lowest sortOrder) — `marginMode` is
 * `fix_selling_price`. On a PUT without `servings`, those three fields are overwritten by the
 * primary service and listed in the response's `ignoredFields` when they differed. To change a
 * product's price, send `servings` in the same PUT (atomic) or use `PUT /api/products/:id/servings`.
 *
 * Volumes: `doseVolumeCl` and every service volume must be ≤ `containerVolumeCl` (400 otherwise).
 */
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
  alcoholDegree?: number;
  supplier?: string | null;
  /** Data URI (≤ 300 000 chars). On update: omitted = unchanged, null = remove the photo. */
  imageUrl?: string | null;
  /** Data URI (≤ 40 000 chars). On update: omitted = unchanged, null = remove. */
  thumbnailUrl?: string | null;
  /**
   * Optional: replace the product's services in the same transaction (same rules as
   * `PUT /api/products/:id/servings`: services not sent are deleted, prices must be > 0).
   */
  servings?: { servingTypeId: string; sellingPriceTTC: number }[];
}

/** Limits enforced by the API for product photos (string length of the data URI). */
export const PRODUCT_IMAGE_MAX_CHARS = 300_000;
export const PRODUCT_THUMBNAIL_MAX_CHARS = 40_000;

/** Coefficient used to derive a selling price when an imported line has none. */
export const IMPORT_DEFAULT_COEFFICIENT = 4;

// --- Invoice import (POST /api/products/import) ---

export interface ImportProductLine {
  name: string;
  /** Category id (uuid) — or use `category` with a slug. Defaults to « spiritueux ». */
  categoryId?: string;
  /** Category slug: spiritueux | vins | bieres | softs | ingredients_cocktails | consommables */
  category?: string;
  /** Unit purchase price HT of one container (bottle, can, keg…). */
  purchasePriceHT?: number | null;
  /** Defaults to the user's default container (70 cl). */
  containerVolumeCl?: number | null;
  /** Defaults by category: vins 12, bieres 25, softs 25, others 5 cl (capped at the container). */
  doseVolumeCl?: number | null;
  /** If missing or ≤ 0: derived with coefficient 4, rounded to 0,10 €. */
  sellingPriceTTC?: number | null;
  tvaRate?: number | null;
  alcoholDegree?: number | null;
  supplier?: string | null;
  quantity?: number | null;
}

export interface ImportProductsInput {
  supplier?: string | null;
  lines: ImportProductLine[];
}

export type ImportLineResult =
  | {
      index: number;
      ok: true;
      name: string;
      productId: string;
      /** 'updated' = same name + container already existed: only its purchase price was updated. */
      action: 'created' | 'updated';
      sellingPriceTTC: number;
      /** True when the selling price was derived (coefficient 4, rounded to 0,10 €). */
      priceDerived: boolean;
    }
  | { index: number; ok: false; name: string; error: string };

export interface ImportProductsResult {
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  results: ImportLineResult[];
}

// --- API errors ---

export interface ApiValidationIssue {
  /** Dotted path of the field, e.g. "alcoholDegree" or "servings.0.sellingPriceTTC" */
  field: string;
  /** French label of the field, e.g. « Degré d'alcool » */
  label: string;
  /** Readable French message for this field */
  message: string;
  code: string;
}

/** Every API error body. `error` is always a readable French sentence (show it as is). */
export interface ApiErrorBody {
  error: string;
  details?: ApiValidationIssue[];
  /** Machine-readable reason, when useful (e.g. scan failures: 'empty' | 'bad_image' | 'busy' | 'timeout' | 'engine'). */
  code?: string;
  retryable?: boolean;
}

// --- Custom Containers (contenants) ---

export interface CustomContainer {
  id: string;
  userId: string;
  name: string;
  volumeCl: number;
  sortOrder: number;
}

// --- Serving Types (types de service) ---

export interface ServingType {
  id: string;
  userId: string;
  name: string;
  volumeCl: number;
  icon: string;
  sortOrder: number;
}

export interface CreateServingTypeInput {
  name: string;
  volumeCl: number;
  icon?: string;
  sortOrder?: number;
}

export interface ProductServing {
  id: string;
  productId: string;
  servingTypeId: string;
  sellingPriceTTC: number;
  servingType: ServingType;
}

export interface ServingMarginResult {
  servingType: ServingType;
  sellingPriceTTC: number;
  sellingPriceHT: number;
  servingsPerContainer: number;
  costPerServingHT: number;
  marginPerServingHT: number;
  marginPercent: number;
  revenuePerContainer: number;
  marginPerContainer: number;
  colorCode: 'green' | 'orange' | 'red';
}

/** Default serving types created for new users */
export const DEFAULT_SERVING_TYPES: Omit<ServingType, 'id' | 'userId'>[] = [
  { name: 'Shot', volumeCl: 3, icon: '🥃', sortOrder: 1 },
  { name: 'Verre (spiritueux)', volumeCl: 5, icon: '🥃', sortOrder: 2 },
  { name: 'Verre de vin', volumeCl: 12, icon: '🍷', sortOrder: 3 },
  { name: 'Demi', volumeCl: 25, icon: '🍺', sortOrder: 4 },
  { name: 'Pinte', volumeCl: 50, icon: '🍺', sortOrder: 5 },
];
