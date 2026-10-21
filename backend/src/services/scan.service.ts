import Tesseract from 'tesseract.js';
import { CONTAINER_PRESETS } from '@margebar/shared';

export interface ScanResult {
  name: string;
  category: string;
  containerVolumeCl: number | null;
  estimatedPriceHT: number | null;
  confidence: number;
  raw: string;
}

export interface InvoiceProduct {
  name: string;
  category: string;
  containerVolumeCl: number | null;
  purchasePriceHT: number | null;
  quantity: number;
  confidence: number;
}

export interface InvoiceScanResult {
  supplier: string;
  invoiceDate: string | null;
  products: InvoiceProduct[];
  raw: string;
}

// Category keywords for auto-detection
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  spiritueux: ['whisky', 'whiskey', 'vodka', 'gin', 'rhum', 'rum', 'cognac', 'armagnac', 'tequila', 'mezcal', 'brandy', 'eau de vie', 'absinthe', 'pastis', 'ricard', 'bourbon', 'scotch'],
  vins: ['vin', 'wine', 'bordeaux', 'bourgogne', 'champagne', 'chablis', 'merlot', 'cabernet', 'pinot', 'chardonnay', 'sauvignon', 'rose', 'rouge', 'blanc', 'cremant', 'prosecco', 'cava', 'cotes du', 'chateau', 'domaine'],
  bieres: ['biere', 'beer', 'ipa', 'lager', 'stout', 'ale', 'blonde', 'ambree', 'blanche', 'pilsner', 'porter', 'pils', 'kronenbourg', 'heineken', 'leffe', 'hoegaarden', 'desperados'],
  softs: ['coca', 'pepsi', 'orangina', 'schweppes', 'perrier', 'evian', 'vittel', 'badoit', 'jus', 'sirop', 'limonade', 'tonic', 'soda', 'eau minerale', 'red bull', 'sprite', 'fanta'],
  ingredients_cocktails: ['triple sec', 'curacao', 'grenadine', 'angostura', 'bitter', 'vermouth', 'cointreau', 'grand marnier', 'amaretto', 'bailey', 'kahlua', 'malibu', 'limoncello'],
};

function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  let best = 'spiritueux';
  let bestScore = 0;
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.filter(k => lower.includes(k)).length;
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  return best;
}

// Extract volume from OCR text (e.g. "70cl", "75 cl", "1L", "700ml")
function extractVolume(text: string): number | null {
  const clMatch = text.match(/(\d+(?:[.,]\d+)?)\s*cl\b/i);
  if (clMatch) return parseFloat(clMatch[1].replace(',', '.'));
  const mlMatch = text.match(/(\d+)\s*ml\b/i);
  if (mlMatch) return parseFloat(mlMatch[1]) / 10;
  const lMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:l|litre|litres)\b/i);
  if (lMatch) return parseFloat(lMatch[1].replace(',', '.')) * 100;
  return null;
}

// Extract alcohol degree (e.g. "40%", "40% vol", "12,5° vol")
function extractDegree(text: string): number | null {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(%\s*(?:vol)?|°\s*(?:vol)?)/i);
  if (match) return parseFloat(match[1].replace(',', '.'));
  return null;
}

// Extract price (e.g. "12,50€", "€15.99", "HT: 8,90")
function extractPrice(text: string): number | null {
  const patterns = [
    /(\d+[.,]\d{2})\s*€/,
    /€\s*(\d+[.,]\d{2})/,
    /HT\s*:?\s*(\d+[.,]\d{2})/i,
    /prix\s*:?\s*(\d+[.,]\d{2})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseFloat(m[1].replace(',', '.'));
  }
  return null;
}

// Extract the most prominent text as product name (first meaningful line)
function extractName(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
  // Skip very short lines and lines that are just numbers/symbols
  for (const line of lines) {
    if (line.match(/^[\d\s.,€%°]+$/)) continue;
    if (line.length >= 3 && line.length <= 80) return line;
  }
  return lines[0] || 'Produit';
}

/**
 * Analyze a bottle image using Tesseract OCR (free, no API key needed).
 */
export async function analyzeBottleImage(imageBase64: string): Promise<ScanResult> {
  console.log('[SCAN] OCR Tesseract en cours...');

  try {
    const buffer = Buffer.from(imageBase64, 'base64');
    const { data: { text } } = await Tesseract.recognize(buffer, 'fra+eng', {
      logger: (m: any) => { if (m.status === 'recognizing text') console.log(`[SCAN] OCR: ${Math.round(m.progress * 100)}%`); },
    });

    console.log('[SCAN] Texte extrait:', text.substring(0, 300));

    const name = extractName(text);
    const category = detectCategory(text);
    const volume = extractVolume(text);
    const price = extractPrice(text);
    const hasContent = text.trim().length > 10;

    return {
      name,
      category,
      containerVolumeCl: volume,
      estimatedPriceHT: price,
      confidence: hasContent ? 0.6 : 0.1,
      raw: text,
    };
  } catch (err) {
    console.error('[SCAN] Erreur OCR:', err);
    throw new Error('Impossible de lire le texte sur l\'image. Essayez avec une photo plus nette.');
  }
}

/**
 * Analyze an invoice image using Tesseract OCR.
 * Extracts product lines from the text.
 */
export async function analyzeInvoiceImage(imageBase64: string): Promise<InvoiceScanResult> {
  console.log('[SCAN-INVOICE] OCR Tesseract en cours...');

  try {
    const buffer = Buffer.from(imageBase64, 'base64');
    const { data: { text } } = await Tesseract.recognize(buffer, 'fra+eng', {
      logger: (m: any) => { if (m.status === 'recognizing text') console.log(`[SCAN-INVOICE] OCR: ${Math.round(m.progress * 100)}%`); },
    });

    console.log('[SCAN-INVOICE] Texte extrait:', text.substring(0, 500));

    // Try to extract supplier from first lines
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    const supplier = lines[0] || 'Fournisseur inconnu';

    // Extract date
    const dateMatch = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    let invoiceDate: string | null = null;
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, '0');
      const month = dateMatch[2].padStart(2, '0');
      const year = dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3];
      invoiceDate = `${year}-${month}-${day}`;
    }

    // Try to extract product lines (lines with a price pattern)
    const products: InvoiceProduct[] = [];
    for (const line of lines) {
      const price = extractPrice(line);
      if (price && price > 0) {
        const category = detectCategory(line);
        const volume = extractVolume(line);
        const qtyMatch = line.match(/x\s*(\d+)|(\d+)\s*x/i);
        const quantity = qtyMatch ? parseInt(qtyMatch[1] || qtyMatch[2]) : 1;
        const name = line.replace(/[\d.,]+\s*€/g, '').replace(/€\s*[\d.,]+/g, '').replace(/x\s*\d+|\d+\s*x/gi, '').trim() || 'Produit';

        products.push({
          name: name.substring(0, 100),
          category,
          containerVolumeCl: volume,
          purchasePriceHT: price,
          quantity,
          confidence: 0.5,
        });
      }
    }

    return { supplier, invoiceDate, products, raw: text };
  } catch (err) {
    console.error('[SCAN-INVOICE] Erreur OCR:', err);
    throw new Error('Impossible de lire la facture. Essayez avec une photo plus nette.');
  }
}
