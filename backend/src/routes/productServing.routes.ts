import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { prisma } from '../config/database';
import { sendKnownError } from '../utils/validation';
import { getServingResults, replaceServings, resyncPrimary, validateServings } from '../services/productServing.service';

const router = Router();

const upsertSchema = z.object({
  servings: z.array(z.object({
    servingTypeId: z.string({ required_error: 'Choisissez un service.' }).min(1, 'Choisissez un service.'),
    sellingPriceTTC: z.number({ required_error: 'Indiquez le prix de vente du service.', invalid_type_error: 'Le prix de vente du service doit être un nombre.' }),
  }), { required_error: 'La liste des services est obligatoire.' }).max(50),
});

router.use(authenticate);

// GET /api/products/:productId/servings - Servings with margin calculations, primary first
router.get('/:productId/servings', async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.productId, userId: req.user!.userId },
    });
    if (!product) {
      res.status(404).json({ error: 'Produit non trouvé' });
      return;
    }
    res.json(await getServingResults(product));
  } catch (err: any) {
    console.error('[SERVINGS] get failed:', err?.message ?? err);
    res.status(500).json({ error: 'Erreur lors de la récupération des services' });
  }
});

/**
 * PUT /api/products/:productId/servings  { servings: [{ servingTypeId, sellingPriceTTC }] }
 * Replaces the FULL set (servings not sent are deleted) in one transaction, and syncs
 * product.sellingPriceTTC / doseVolumeCl to the primary serving (lowest sortOrder).
 * A price ≤ 0 is rejected with a message naming the service(s).
 */
router.put('/:productId/servings', async (req: Request, res: Response) => {
  try {
    const { servings } = upsertSchema.parse(req.body);
    const product = await prisma.product.findFirst({
      where: { id: req.params.productId, userId: req.user!.userId },
    });
    if (!product) {
      res.status(404).json({ error: 'Produit non trouvé' });
      return;
    }

    const validated = await validateServings(req.user!.userId, servings);
    await prisma.$transaction((tx) => replaceServings(tx, product.id, validated));

    res.json(await getServingResults(product));
  } catch (err: any) {
    if (sendKnownError(res, err)) return;
    console.error('[SERVINGS] put failed:', err?.message ?? err);
    res.status(500).json({ error: 'Erreur lors de la mise à jour des services' });
  }
});

// DELETE /api/products/:productId/servings/:servingTypeId
router.delete('/:productId/servings/:servingTypeId', async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.productId, userId: req.user!.userId },
    });
    if (!product) {
      res.status(404).json({ error: 'Produit non trouvé' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.productServing.deleteMany({
        where: { productId: product.id, servingTypeId: req.params.servingTypeId },
      });
      await resyncPrimary(tx, product.id);
    });

    res.status(204).send();
  } catch (err: any) {
    console.error('[SERVINGS] delete failed:', err?.message ?? err);
    res.status(500).json({ error: 'Erreur lors de la suppression du service' });
  }
});

export default router;
