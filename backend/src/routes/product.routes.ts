import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import * as productService from '../services/product.service';
import { CreateProductInput } from '@margebar/shared';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  categoryId: z.string().uuid(),
  purchasePriceHT: z.number().min(0),
  containerVolumeCl: z.number().positive(),
  doseVolumeCl: z.number().positive(),
  marginMode: z.enum(['fix_selling_price', 'fix_target_margin', 'fix_coefficient']),
  sellingPriceTTC: z.number().positive().optional(),
  targetMarginPercent: z.number().optional(),
  coefficient: z.number().positive().optional(),
  tvaRate: z.number().min(0).max(1),
  alcoholDegree: z.number().min(0).max(100).optional(),
  supplier: z.string().optional(),
});

router.use(authenticate);

router.get('/', async (req: Request, res: Response) => {
  try {
    const categoryId = req.query.categoryId as string | undefined;
    const products = await productService.getProducts(req.user!.userId, categoryId);
    res.json(products);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const product = await productService.getProduct(req.params.id, req.user!.userId);
    res.json(product);
  } catch (err: any) {
    const status = err.message === 'Produit non trouvé' ? 404 : 500;
    res.status(status).json({ error: status === 404 ? 'Produit non trouvé' : 'Erreur serveur' });
  }
});

router.get('/:id/price-history', async (req: Request, res: Response) => {
  try {
    const history = await productService.getPriceHistory(req.params.id, req.user!.userId);
    res.json(history);
  } catch (err: any) {
    const status = err.message === 'Produit non trouvé' ? 404 : 500;
    res.status(status).json({ error: status === 404 ? 'Produit non trouvé' : 'Erreur serveur' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = createSchema.parse(req.body) as CreateProductInput;
    const product = await productService.createProduct(req.user!.userId, data);
    res.status(201).json(product);
  } catch (err: any) {
    const status = err.name === 'ZodError' ? 400 : 500;
    res.status(status).json({ error: err.name === 'ZodError' ? err.message : 'Erreur serveur' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const data = createSchema.partial().parse(req.body) as Partial<CreateProductInput>;
    const product = await productService.updateProduct(req.params.id, req.user!.userId, data);
    res.json(product);
  } catch (err: any) {
    const status = err.message === 'Produit non trouvé' ? 404 : err.name === 'ZodError' ? 400 : 500;
    res.status(status).json({
      error: err.message === 'Produit non trouvé' ? err.message : err.name === 'ZodError' ? err.message : 'Erreur serveur',
    });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await productService.deleteProduct(req.params.id, req.user!.userId);
    res.status(204).send();
  } catch (err: any) {
    const status = err.message === 'Produit non trouvé' ? 404 : 500;
    res.status(status).json({ error: status === 404 ? 'Produit non trouvé' : 'Erreur serveur' });
  }
});

export default router;
