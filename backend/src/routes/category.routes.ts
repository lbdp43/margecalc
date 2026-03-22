import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import * as categoryService from '../services/category.service';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1, 'Nom requis').max(100),
});

router.use(authenticate);

router.get('/', async (_req: Request, res: Response) => {
  try {
    const categories = await categoryService.getCategories();
    res.json(categories);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const data = createSchema.parse(req.body);
    const slug = data.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const category = await categoryService.createCategory({ name: data.name.trim(), slug, icon: '', sortOrder: 99 });
    res.status(201).json(category);
  } catch (err: any) {
    const status = err.name === 'ZodError' ? 400 : 500;
    res.status(status).json({ error: err.name === 'ZodError' ? err.message : 'Erreur serveur' });
  }
});

export default router;
