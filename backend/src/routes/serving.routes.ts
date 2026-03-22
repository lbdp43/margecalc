import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { DEFAULT_SERVING_TYPES } from '@margebar/shared';

const prisma = new PrismaClient();
const router = Router();

const createSchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  volumeCl: z.number().positive('Volume doit être > 0'),
  icon: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

const updateSchema = createSchema.partial();

router.use(authenticate);

// GET /api/servings - List user's serving types (auto-create defaults if none)
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    let servingTypes = await prisma.servingType.findMany({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
    });

    // Auto-create defaults on first access
    if (servingTypes.length === 0) {
      await prisma.servingType.createMany({
        data: DEFAULT_SERVING_TYPES.map((st) => ({
          userId,
          name: st.name,
          volumeCl: st.volumeCl,
          icon: st.icon,
          sortOrder: st.sortOrder,
        })),
      });
      servingTypes = await prisma.servingType.findMany({
        where: { userId },
        orderBy: { sortOrder: 'asc' },
      });
    }

    res.json(servingTypes);
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/servings - Create a serving type
router.post('/', async (req: Request, res: Response) => {
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
    const status = err.name === 'ZodError' ? 400 : 500;
    res.status(status).json({ error: err.name === 'ZodError' ? err.message : 'Erreur serveur' });
  }
});

// PUT /api/servings/:id - Update a serving type
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const data = updateSchema.parse(req.body);
    const servingType = await prisma.servingType.updateMany({
      where: { id: req.params.id, userId: req.user!.userId },
      data,
    });
    if (servingType.count === 0) {
      res.status(404).json({ error: 'Type de service non trouvé' });
      return;
    }
    const updated = await prisma.servingType.findFirst({ where: { id: req.params.id, userId: req.user!.userId } });
    res.json(updated);
  } catch (err: any) {
    const status = err.name === 'ZodError' ? 400 : 500;
    res.status(status).json({ error: err.name === 'ZodError' ? err.message : 'Erreur serveur' });
  }
});

// DELETE /api/servings/:id - Delete a serving type
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await prisma.servingType.deleteMany({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (result.count === 0) {
      res.status(404).json({ error: 'Type de service non trouvé' });
      return;
    }
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
