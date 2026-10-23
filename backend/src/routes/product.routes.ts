import { Router, Request, Response } from 'express';
import { z, ZodError } from 'zod';
import { authenticate } from '../middleware/auth';
import { invoicePreviewLimiter, userWriteLimiter } from '../middleware/userRateLimit';
import * as productService from '../services/product.service';
import { applyPriceBatch, BATCH_MAX_UPDATES } from '../services/priceBatch.service';
import { CreateProductInput, PRODUCT_IMAGE_MAX_CHARS, PRODUCT_THUMBNAIL_MAX_CHARS } from '@margebar/shared';
import { formatZodError, sendKnownError, validationErrorBody } from '../utils/validation';

const router = Router();

const querySchema = z.object({
  categoryId: z.string().uuid().optional(),
});

// --- Photo fields -----------------------------------------------------------
// Contract: data URI `data:image/(jpeg|png|webp);base64,…` (or an https URL).
// Missing = unchanged, null = remove. Local device URIs (file:, blob:, content:, ph:) are
// meaningless on the server and other devices: they are ignored instead of failing the save.
const DATA_URI_RE = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const HTTPS_RE = /^https:\/\/\S{1,2040}$/;
const LOCAL_URI_RE = /^(file|blob|content|ph|assets-library|ms-appdata):/i;
const PHOTO_TOO_BIG = 'Photo trop volumineuse';

function photoField(maxChars: number, label: string) {
  return z.preprocess(
    (v) => {
      if (typeof v !== 'string') return v;
      if (v.trim() === '') return null;
      if (LOCAL_URI_RE.test(v)) return undefined;
      return v;
    },
    z.string()
      .max(maxChars, PHOTO_TOO_BIG)
      .refine((s) => s.length > maxChars || DATA_URI_RE.test(s) || HTTPS_RE.test(s), {
        message: `${label} invalide : formats acceptés JPEG, PNG ou WebP.`,
      })
      .nullable()
      .optional(),
  );
}

const optionalNumber = (schema: z.ZodNumber) => schema.nullable().optional();

const servingsSchema = z.array(z.object({
  servingTypeId: z.string({ required_error: 'Choisissez un service.' }).min(1, 'Choisissez un service.'),
  sellingPriceTTC: z.number({ required_error: 'Indiquez le prix de vente du service.', invalid_type_error: 'Le prix de vente du service doit être un nombre.' }),
})).max(50);

const baseShape = {
  name: z.string().trim().min(1, 'Le nom du produit est obligatoire.').max(200, 'Le nom du produit est trop long (200 caractères maximum).'),
  categoryId: z.string({ required_error: 'Choisissez une catégorie.' }).uuid('Choisissez une catégorie.'),
  purchasePriceHT: z.number().min(0).max(100_000),
  containerVolumeCl: z.number().positive().max(100_000),
  doseVolumeCl: z.number().positive().max(100_000),
  marginMode: z.enum(['fix_selling_price', 'fix_target_margin', 'fix_coefficient']),
  sellingPriceTTC: optionalNumber(z.number().min(0).max(100_000)),
  targetMarginPercent: optionalNumber(z.number().min(0).max(99.9)),
  coefficient: optionalNumber(z.number().positive().max(1000)),
  tvaRate: z.number().min(0).max(0.5),
  alcoholDegree: optionalNumber(z.number().min(0).max(100)),
  supplier: z.string().trim().max(200).nullable().optional(),
  imageUrl: photoField(PRODUCT_IMAGE_MAX_CHARS, 'Photo'),
  thumbnailUrl: photoField(PRODUCT_THUMBNAIL_MAX_CHARS, 'Miniature de la photo'),
  /** Optional: replace the servings in the same transaction (same rules as PUT /:id/servings). */
  servings: servingsSchema.optional(),
};

const createSchema = z.object(baseShape);
const updateSchema = z.object(baseShape).partial();

/** 400 with readable French text — or 413 'Photo trop volumineuse' when only the photo is too big. */
function sendValidation(res: Response, err: ZodError): void {
  const body = validationErrorBody(err);
  const onlyPhotoTooBig = err.issues.length > 0 && err.issues.every((i) => i.message === PHOTO_TOO_BIG);
  res.status(onlyPhotoTooBig ? 413 : 400).json(onlyPhotoTooBig ? { ...body, error: PHOTO_TOO_BIG } : body);
}

function handleError(res: Response, err: any, fallback = 'Erreur serveur'): void {
  if (err instanceof ZodError || err?.name === 'ZodError') return sendValidation(res, err);
  if (sendKnownError(res, err)) return;
  if (err?.message === 'Produit non trouvé') {
    res.status(404).json({ error: 'Produit non trouvé' });
    return;
  }
  console.error('[PRODUCTS]', err?.message ?? err);
  res.status(500).json({ error: fallback });
}

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { categoryId } = querySchema.parse(req.query);
    const products = await productService.getProducts(req.user!.userId, categoryId);
    res.json(products);
  } catch (err) {
    handleError(res, err);
  }
});

// --- Invoice import ------------------------------------------------------------

const num = (v: unknown) => {
  if (typeof v === 'string') {
    const t = v.replace(/\s| |€/g, '').replace(',', '.');
    if (t === '') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : v;
  }
  return v;
};
const lineNumber = (schema: z.ZodNumber) => z.preprocess(num, schema.nullable().optional());

const PRODUCT_TO_UPDATE_UNKNOWN = 'Le produit à mettre à jour est introuvable. Rechargez puis réessayez.';

const importLineSchema = z.object({
  name: z.string({ required_error: 'Le nom du produit est obligatoire.' }).trim().min(1, 'Le nom du produit est obligatoire.').max(200, 'Le nom du produit est trop long (200 caractères maximum).'),
  categoryId: z.string().uuid('Catégorie inconnue.').nullable().optional(),
  category: z.string().max(50).nullable().optional(),
  purchasePriceHT: lineNumber(z.number().min(0).max(100_000)),
  containerVolumeCl: lineNumber(z.number().positive().max(100_000)),
  doseVolumeCl: lineNumber(z.number().positive().max(100_000)),
  sellingPriceTTC: lineNumber(z.number().min(0).max(100_000)),
  tvaRate: lineNumber(z.number().min(0).max(0.5)),
  alcoholDegree: lineNumber(z.number().min(0).max(100)),
  supplier: z.string().trim().max(200).nullable().optional(),
  quantity: lineNumber(z.number().min(0).max(1_000_000)),
  /** Lot 2: update THIS product (must belong to the user) instead of matching. */
  productId: z.string({ invalid_type_error: PRODUCT_TO_UPDATE_UNKNOWN }).uuid(PRODUCT_TO_UPDATE_UNKNOWN).nullable().optional(),
  /** Lot 2: create a new product even if a match exists. */
  createNew: z.boolean().nullable().optional(),
}, { invalid_type_error: 'Ligne illisible : chaque ligne doit décrire un produit (nom, prix…).' }).refine((l) => !(l.productId && l.createNew), {
  message: 'Choisissez entre mettre à jour un produit existant et créer un nouveau produit.',
  path: ['createNew'],
});

const importSchema = z.object({
  supplier: z.string().trim().max(200).nullable().optional(),
  lines: z.array(z.unknown(), { required_error: 'Aucune ligne à importer.', invalid_type_error: 'Aucune ligne à importer.' })
    .min(1, 'Aucune ligne à importer.')
    .max(200, 'Trop de lignes à importer en une fois (200 maximum).'),
  /** POST /import only: also link lines to a 'fuzzy' look-alike without asking (default false). */
  autoLinkFuzzy: z.boolean().optional(),
}, { invalid_type_error: 'Requête illisible : envoyez les lignes de la facture.', required_error: 'Requête illisible : envoyez les lignes de la facture.' });

function parseImportLines(lines: unknown[]): productService.ParsedImportLine[] {
  return lines.map((raw, index) => {
    const rawName = typeof (raw as any)?.name === 'string' ? String((raw as any).name).slice(0, 200) : '';
    const parsed = importLineSchema.safeParse(raw);
    if (!parsed.success) return { index, line: null, error: formatZodError(parsed.error), rawName };
    return { index, line: parsed.data, rawName };
  });
}

/**
 * POST /api/products/import/preview  { supplier?, lines: ImportProductLine[] } → 200 ImportPreviewResult.
 * Writes nothing: for each line, the product POST /import would update (exact, alias or fuzzy
 * match), up to 3 look-alike candidates and the matched product's current price and margin.
 * CPU work: 60 previews per 15 min per user; past 5 s, 503 { code: 'busy', retryable: true }.
 */
router.post('/import/preview', invoicePreviewLimiter, async (req: Request, res: Response) => {
  try {
    const body = importSchema.parse(req.body);
    res.json(await productService.previewImport(req.user!.userId, body.supplier, parseImportLines(body.lines)));
  } catch (err) {
    handleError(res, err, 'Erreur serveur lors de l’analyse de la facture');
  }
});

/**
 * POST /api/products/import  { supplier?, lines: ImportProductLine[], autoLinkFuzzy? }
 * A 'fuzzy' look-alike is only linked when the user confirmed it (line.productId) or the client
 * passes autoLinkFuzzy: true; otherwise such a line creates a new product, as the review showed it.
 * → 200 ImportProductsResult (at least one line imported) | 422 { error, ...ImportProductsResult } (none).
 * Each line is validated and written on its own: errors are reported per line.
 */
router.post('/import', userWriteLimiter, async (req: Request, res: Response) => {
  try {
    const body = importSchema.parse(req.body);
    const lines = parseImportLines(body.lines);
    const result = await productService.importProducts(req.user!.userId, body.supplier, lines, { autoLinkFuzzy: body.autoLinkFuzzy === true });
    if (result.createdCount + result.updatedCount === 0) {
      const firstError = result.results.find((r) => !r.ok);
      const detail = firstError && !firstError.ok ? ` Ligne ${firstError.index + 1}${firstError.name ? ` (${firstError.name})` : ''} : ${firstError.error}` : '';
      res.status(422).json({ error: `Aucun produit n’a pu être importé.${detail}`, ...result });
      return;
    }
    res.json(result);
  } catch (err) {
    handleError(res, err, 'Erreur serveur lors de l’import');
  }
});

// --- Batch price update -------------------------------------------------------

const batchSchema = z.object({
  updates: z.array(z.unknown(), { required_error: 'Aucun prix à modifier.', invalid_type_error: 'Aucun prix à modifier.' })
    .min(1, 'Aucun prix à modifier.')
    .max(BATCH_MAX_UPDATES, `Trop de produits en une fois (${BATCH_MAX_UPDATES} maximum).`),
}, { invalid_type_error: 'Requête illisible : envoyez la liste des prix à modifier.', required_error: 'Requête illisible : envoyez la liste des prix à modifier.' });

/**
 * POST /api/products/prices/batch  { updates: BatchPriceUpdate[] } → 200 BatchPricesResult
 * One transaction: every update is applied, or none (400 naming the products to fix).
 * Post `{ updates: previous }` back to undo.
 */
router.post('/prices/batch', userWriteLimiter, async (req: Request, res: Response) => {
  try {
    const { updates } = batchSchema.parse(req.body);
    res.json(await applyPriceBatch(req.user!.userId, updates));
  } catch (err) {
    handleError(res, err, 'Erreur serveur : aucun prix n’a été modifié.');
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const product = await productService.getProduct(req.params.id, req.user!.userId);
    res.json(product);
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/:id/price-history', async (req: Request, res: Response) => {
  try {
    const history = await productService.getPriceHistory(req.params.id, req.user!.userId);
    res.json(history);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/', userWriteLimiter, async (req: Request, res: Response) => {
  try {
    const data = createSchema.parse(req.body) as CreateProductInput & { servings?: { servingTypeId: string; sellingPriceTTC: number }[] };
    const product = await productService.createProduct(req.user!.userId, data);
    res.status(201).json(product);
  } catch (err) {
    handleError(res, err);
  }
});

router.put('/:id', userWriteLimiter, async (req: Request, res: Response) => {
  try {
    const data = updateSchema.parse(req.body) as productService.ProductWrite;
    const product = await productService.updateProduct(req.params.id, req.user!.userId, data);
    res.json(product);
  } catch (err) {
    handleError(res, err);
  }
});

router.delete('/:id', userWriteLimiter, async (req: Request, res: Response) => {
  try {
    await productService.deleteProduct(req.params.id, req.user!.userId);
    res.status(204).send();
  } catch (err) {
    handleError(res, err);
  }
});

export default router;
