import { CONTAINER_PRESETS } from '@margebar/shared';

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
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Erreur API vision: ${response.status} - ${err}`);
  }

  const data = (await response.json()) as { content?: Array<{ text?: string }> };
  const text = data.content?.[0]?.text || '';

  try {
    // Extract JSON from response (handle markdown code blocks)
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
    return {
      name: 'Produit non reconnu',
      category: 'spiritueux',
      containerVolumeCl: null,
      estimatedPriceHT: null,
      confidence: 0,
      raw: text,
    };
  }
}
