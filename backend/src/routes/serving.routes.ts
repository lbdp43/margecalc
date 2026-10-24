import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { userWriteLimiter } from '../middleware/userRateLimit';
import { prisma } from '../config/database';
import { sendKnownError } from '../utils/validation';
import { ensureServingTypes, resyncPrimary } from '../services/productServing.service';
const router = Router();

const createSchema = z.object({
  name: z.string().trim().min(1, 'Le nom du service est obligatoire.').max(100),
  volumeCl: z.number().positive('Le volume du service doit être supérieur à 0.').max(100_000),
  icon: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

const updateSchema = createSchema.partial();

router.use(authenticate);

// GET /api/servings - List user's serving types (auto-create defaults if none)
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const servingTypes = await ensureServingTypes(userId);

    res.json(servingTypes);
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/servings - Create a serving type
router.post('/', userWriteLimiter, async (req: Request, res: Response) => {
  try {
    const data = createSchema.parse(req.body);
    const servingType = await prisma.servingType.create({
      data: {
        userId: req.user!.userId,
        ...data,
      },
    });
    res.status(201).json(servingType);
  } catch (err: any) {
    if (sendKnownError(res, err)) return;
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/servings/:id - Update a serving type
router.put('/:id', userWriteLimiter, async (req: Request, res: Response) => {
  try {
    const data = updateSchema.parse(req.body);
    if (data.volumeCl !== undefined) {
      // A bigger glass must still fit in every bottle that is served with it.
      const tooSmall = await prisma.productServing.findMany({
        where: {
          servingTypeId: req.params.id,
          servingType: { userId: req.user!.userId },
          product: { containerVolumeCl: { lt: data.volumeCl } },
        },
        select: { product: { select: { name: true, containerVolumeCl: true } } },
        take: 50,
      });
      if (tooSmall.length) {
        const p = tooSmall[0].product;
        const more = tooSmall.length > 1 ? ` et ${tooSmall.length - 1} autre${tooSmall.length > 2 ? 's' : ''} produit${tooSmall.length > 2 ? 's' : ''}` : '';
        res.status(400).json({
          error: `Ce volume dépasse la contenance de « ${p.name} » (${String(p.containerVolumeCl).replace('.', ',')}\u00a0cl)${more}. Retirez ce service de ces produits ou choisissez un volume plus petit.`,
          details: tooSmall.map(({ product }) => ({ field: 'volumeCl', label: product.name, message: `« ${product.name} » ne contient que ${String(product.containerVolumeCl).replace('.', ',')}\u00a0cl.`, code: 'too_big' })),
        });
        return;
      }
    }
    const servingType = await prisma.servingType.updateMany({
      where: { id: req.params.id, userId: req.user!.userId },
      data,
    });
    if (servingType.count === 0) {
      res.status(404).json({ error: 'Type de service non trouvé' });
      return;
    }
    const updated = await prisma.servingType.findFirst({ where: { id: req.params.id, userId: req.user!.userId } });
    if (data.volumeCl !== undefined || data.sortOrder !== undefined) {
      // Keep the products' headline dose/price in sync with their primary serving.
      const uses = await prisma.productServing.findMany({ where: { servingTypeId: req.params.id }, select: { productId: true } });
      for (const { productId } of uses) {
        await prisma.$transaction((tx) => resyncPrimary(tx, productId));
      }
    }
    res.json(updated);
  } catch (err: any) {
    if (sendKnownError(res, err)) return;
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/servings/:id - Delete a serving type
router.delete('/:id', userWriteLimiter, async (req: Request, res: Response) => {
  try {
    const uses = await prisma.productServing.findMany({
      where: { servingTypeId: req.params.id, servingType: { userId: req.user!.userId } },
      select: { productId: true },
    });
    const result = await prisma.servingType.deleteMany({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (result.count === 0) {
      res.status(404).json({ error: 'Type de service non trouvé' });
      return;
    }
    // Product servings were cascade-deleted: re-sync each product on its new primary serving.
    for (const { productId } of uses) {
      await prisma.$transaction((tx) => resyncPrimary(tx, productId));
    }
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
