import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import * as containerService from '../services/container.service';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  volumeCl: z.number().positive('Volume doit être > 0'),
  sortOrder: z.number().int().optional(),
});

const updateSchema = createSchema.partial();

router.use(authenticate);

// GET /api/containers - List user's custom containers (auto-create defaults if none)
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const containers = await containerService.getContainers(userId);
    res.json(containers);
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/containers - Create a custom container
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = createSchema.parse(req.body);
    const container = await containerService.createContainer(req.user!.userId, data);
    res.status(201).json(container);
  } catch (err: any) {
    const status = err.name === 'ZodError' ? 400 : 500;
    res.status(status).json({ error: err.name === 'ZodError' ? err.message : 'Erreur serveur' });
  }
});

// PUT /api/containers/:id - Update a custom container
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const data = updateSchema.parse(req.body);
    const container = await containerService.updateContainer(req.user!.userId, req.params.id, data);
    if (!container) {
      res.status(404).json({ error: 'Contenant non trouvé' });
      return;
    }
    res.json(container);
  } catch (err: any) {
    const status = err.name === 'ZodError' ? 400 : 500;
    res.status(status).json({ error: err.name === 'ZodError' ? err.message : 'Erreur serveur' });
  }
});

// DELETE /api/containers/:id - Delete a custom container
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await containerService.deleteContainer(req.user!.userId, req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Contenant non trouvé' });
      return;
    }
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
