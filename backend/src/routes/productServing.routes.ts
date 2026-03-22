import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { calculateServingMargin } from '@margebar/shared';
import { prisma } from '../config/database';

const router = Router();

const upsertSchema = z.object({
  servings: z.array(z.object({
    servingTypeId: z.string(),
    sellingPriceTTC: z.number().positive(),
  })),
});

router.use(authenticate);

// GET /api/products/:productId/servings - Get servings with margin calculations
router.get('/:productId/servings', async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.productId, userId: req.user!.userId },
    });
    if (!product) {
      res.status(404).json({ error: 'Produit non trouvé' });
      return;
    }

    const productServings = await prisma.productServing.findMany({
      where: { productId: product.id },
      include: { servingType: true },
    });

    const results = productServings.map((ps) => {
      return calculateServingMargin(
        product.purchasePriceHT,
        product.containerVolumeCl,
        product.tvaRate,
        {
          id: ps.servingType.id,
          userId: ps.servingType.userId,
          name: ps.servingType.name,
          volumeCl: ps.servingType.volumeCl,
          icon: ps.servingType.icon,
          sortOrder: ps.servingType.sortOrder,
        },
        ps.sellingPriceTTC,
      );
    });

    res.json(results);
  } catch {
    res.status(500).json({ error: 'Erreur lors de la récupération des services' });
  }
});

// PUT /api/products/:productId/servings - Upsert servings for a product
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

    // Batch upserts in a single transaction
    await prisma.$transaction(
      servings.map((s) =>
        prisma.productServing.upsert({
          where: {
            productId_servingTypeId: {
              productId: product.id,
              servingTypeId: s.servingTypeId,
            },
          },
          create: {
            productId: product.id,
            servingTypeId: s.servingTypeId,
            sellingPriceTTC: s.sellingPriceTTC,
          },
          update: {
            sellingPriceTTC: s.sellingPriceTTC,
          },
        })
      )
    );

    // Return updated results with margin calculations
    const productServings = await prisma.productServing.findMany({
      where: { productId: product.id },
      include: { servingType: true },
    });

    const results = productServings.map((ps) => {
      return calculateServingMargin(
        product.purchasePriceHT,
        product.containerVolumeCl,
        product.tvaRate,
        {
          id: ps.servingType.id,
          userId: ps.servingType.userId,
          name: ps.servingType.name,
          volumeCl: ps.servingType.volumeCl,
          icon: ps.servingType.icon,
          sortOrder: ps.servingType.sortOrder,
        },
        ps.sellingPriceTTC,
      );
    });

    res.json(results);
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: 'Données de services invalides' });
      return;
    }
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

    await prisma.productServing.deleteMany({
      where: {
        productId: product.id,
        servingTypeId: req.params.servingTypeId,
      },
    });

    res.status(204).send();
  } catch {
    res.status(500).json({ error: 'Erreur lors de la suppression du service' });
  }
});

export default router;
