import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { calculateServingMargin } from '@margebar/shared';

const prisma = new PrismaClient();
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

    // Calculate margin for each serving
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
    res.status(500).json({ error: err.message });
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

    // Upsert each serving
    for (const s of servings) {
      await prisma.productServing.upsert({
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
      });
    }

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
    const status = err.name === 'ZodError' ? 400 : 500;
    res.status(status).json({ error: err.message });
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
