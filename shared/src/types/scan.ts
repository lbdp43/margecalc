/**
 * Free OCR scan (Tesseract.js on the server, no API key).
 *
 * POST /api/scan/bottle  (alias: POST /api/scan/product)  body { imageBase64 } → BottleScanResult
 * POST /api/scan/invoice                                   body { imageBase64 } → InvoiceScanResult
 *
 * `imageBase64` is a JPEG/PNG/WebP, raw base64 or a data URI (1280–1600 px recommended).
 * A failed read returns 422 { error: 'Lecture impossible : …', code, retryable } and does NOT
 * count toward the daily quota. Only successful scans are counted.
 */

/** Category slugs returned by the scan (match Category.slug). */
export type ScanCategorySlug =
  | 'spiritueux'
  | 'vins'
  | 'bieres'
  | 'softs'
  | 'ingredients_cocktails'
  | 'consommables';

export interface BottleScanResult {
  /** Product name as read on the label ('' when nothing usable was read). */
  name: string;
  /** Known brand recognised in the name (e.g. "Jameson"), or null. */
  brand: string | null;
  category: ScanCategorySlug;
  containerVolumeCl: number | null;
  /** ABV read on the label (e.g. 40 for "40% vol"), or null. */
  alcoholDegree: number | null;
  /** Only filled when a price is printed on the label (rare). */
  estimatedPriceHT: number | null;
  /** 0..1 — the form must stay a prefill the user checks. */
  confidence: number;
  /** Raw OCR text (debug). */
  raw: string;
}

export interface InvoiceScanProduct {
  name: string;
  category: ScanCategorySlug;
  containerVolumeCl: number | null;
  /** Unit purchase price HT per container (packs "x24" are divided down). */
  purchasePriceHT: number | null;
  quantity: number;
  alcoholDegree: number | null;
  confidence: number;
}

export interface InvoiceScanResult {
  supplier: string;
  /** ISO date YYYY-MM-DD, or null. */
  invoiceDate: string | null;
  products: InvoiceScanProduct[];
  raw: string;
}
