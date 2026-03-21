import { CONTAINER_PRESETS } from '@margebar/shared';

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

export interface ScanResult {
  name: string;
  category: string;
  containerVolumeCl: number | null;
  estimatedPriceHT: number | null;
  confidence: number;
  raw: string;
}

/**
 * Analyze a bottle image using Claude Vision API.
 * Requires ANTHROPIC_API_KEY environment variable.
 */
export async function analyzeBottleImage(imageBase64: string): Promise<ScanResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY non configurée. Ajoutez-la dans les variables d\'environnement.');
  }

  const prompt = `Tu es un expert en boissons pour bars et restaurants. Analyse cette image de bouteille/produit.

Réponds UNIQUEMENT en JSON valide avec ces champs:
{
  "name": "nom complet du produit (marque + type)",
  "category": "spiritueux" | "vins" | "bieres" | "softs" | "ingredients_cocktails" | "consommables",
  "containerVolumeCl": nombre en cl (50, 70, 100, 150, 300, 500, 1000, 2000, 3000) ou null si pas visible,
  "estimatedPriceHT": prix d'achat HT estimé en euros (prix grossiste bar) ou null si impossible,
  "confidence": 0 à 1 (confiance dans la reconnaissance)
}

Contenants standards: ${CONTAINER_PRESETS.map(p => p.label).join(', ')}

Sois précis sur le nom. Si c'est un spiritueux, indique la marque et le type (ex: "Absolut Vodka", "Havana Club 3 ans").
Si tu ne reconnais pas le produit, mets confidence à 0.`;

  console.log('[SCAN] Envoi image à Claude Vision API...');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      console.error(`[SCAN] Erreur API: ${response.status} - ${err}`);
      throw new Error(`Erreur API vision: ${response.status} - ${err}`);
    }

    const data = (await response.json()) as { content?: Array<{ text?: string }> };
    const text = data.content?.[0]?.text || '';
    console.log('[SCAN] Réponse reçue:', text.substring(0, 200));

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Pas de JSON dans la réponse');
      const parsed = JSON.parse(jsonMatch[0]);

      return {
        name: parsed.name || 'Produit non reconnu',
        category: parsed.category || 'spiritueux',
        containerVolumeCl: parsed.containerVolumeCl || null,
        estimatedPriceHT: parsed.estimatedPriceHT || null,
        confidence: parsed.confidence || 0,
        raw: text,
      };
    } catch {
      console.warn('[SCAN] Parsing JSON échoué, réponse brute:', text);
      return {
        name: 'Produit non reconnu',
        category: 'spiritueux',
        containerVolumeCl: null,
        estimatedPriceHT: null,
        confidence: 0,
        raw: text,
      };
    }
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.error('[SCAN] Timeout après 60s');
      throw new Error('L\'analyse a pris trop de temps. Réessayez avec une photo plus nette.');
    }
    throw err;
  }
}

/**
 * Analyze an invoice/facture image using Claude Vision API.
 * Extracts all product lines from the invoice.
 * Requires ANTHROPIC_API_KEY environment variable.
 */
export async function analyzeInvoiceImage(imageBase64: string): Promise<InvoiceScanResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY non configurée. Ajoutez-la dans les variables d\'environnement.');
  }

  const prompt = `Tu es un expert en analyse de factures pour bars et restaurants. Analyse cette image de facture/invoice.

Extrais TOUS les produits listés sur la facture. Réponds UNIQUEMENT en JSON valide avec ce format:
{
  "supplier": "nom du fournisseur",
  "invoiceDate": "date de la facture au format YYYY-MM-DD" ou null si pas visible,
  "products": [
    {
      "name": "nom complet du produit (marque + type)",
      "category": "spiritueux" | "vins" | "bieres" | "softs" | "ingredients_cocktails" | "consommables",
      "containerVolumeCl": nombre en cl (50, 70, 100, 150, 300, 500, 1000, 2000, 3000) ou null si pas visible,
      "purchasePriceHT": prix d'achat HT par unité en euros ou null si pas visible,
      "quantity": quantité commandée (1 par défaut),
      "confidence": 0 à 1 (confiance dans la reconnaissance de cette ligne)
    }
  ]
}

Contenants standards: ${CONTAINER_PRESETS.map(p => p.label).join(', ')}

Identifie bien:
- Le nom du fournisseur (en-tête de la facture)
- La date de la facture
- Pour chaque ligne produit: le nom complet, la catégorie, le volume du contenant en cl, le prix d'achat HT unitaire, la quantité commandée

Sois précis sur les noms de produits. Si c'est un spiritueux, indique la marque et le type (ex: "Absolut Vodka", "Havana Club 3 ans").
N'oublie aucune ligne produit de la facture.`;

  console.log('[SCAN-INVOICE] Envoi image de facture à Claude Vision API...');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      console.error(`[SCAN-INVOICE] Erreur API: ${response.status} - ${err}`);
      throw new Error(`Erreur API vision: ${response.status} - ${err}`);
    }

    const data = (await response.json()) as { content?: Array<{ text?: string }> };
    const text = data.content?.[0]?.text || '';
    console.log('[SCAN-INVOICE] Réponse reçue:', text.substring(0, 200));

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Pas de JSON dans la réponse');
      const parsed = JSON.parse(jsonMatch[0]);

      const products: InvoiceProduct[] = (parsed.products || []).map((p: any) => ({
        name: p.name || 'Produit non reconnu',
        category: p.category || 'spiritueux',
        containerVolumeCl: p.containerVolumeCl || null,
        purchasePriceHT: p.purchasePriceHT || null,
        quantity: p.quantity || 1,
        confidence: p.confidence || 0,
      }));

      return {
        supplier: parsed.supplier || 'Fournisseur inconnu',
        invoiceDate: parsed.invoiceDate || null,
        products,
        raw: text,
      };
    } catch {
      console.warn('[SCAN-INVOICE] Parsing JSON échoué, réponse brute:', text);
      return {
        supplier: 'Fournisseur inconnu',
        invoiceDate: null,
        products: [],
        raw: text,
      };
    }
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.error('[SCAN-INVOICE] Timeout après 120s');
      throw new Error('L\'analyse de la facture a pris trop de temps. Réessayez avec une photo plus nette.');
    }
    throw err;
  }
}
