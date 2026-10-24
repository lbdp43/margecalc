import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate, isAdminNow } from '../middleware/auth';
import { userWriteLimiter } from '../middleware/userRateLimit';
import * as categoryService from '../services/category.service';
import { HttpError, sendKnownError } from '../utils/validation';

const router = Router();

const createSchema = z.object({
  name: z.string({ required_error: 'Le nom de la catégorie est obligatoire.' })
    .trim()
    .min(1, 'Le nom de la catégorie est obligatoire.')
    .max(60, 'Le nom de la catégorie est trop long (60 caractères maximum).'),
  /** Admins only: add a built-in category to every account (default for an admin). */
  global: z.boolean().optional(),
});

router.use(authenticate);

// GET /api/categories — built-in categories + the caller's private ones
router.get('/', async (req: Request, res: Response) => {
  try {
    const categories = await categoryService.getCategories(req.user!.userId);
    res.json(categories);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST /api/categories { name, global? }
 * - a regular account creates a PRIVATE category (visible to that account only);
 * - an admin creates a built-in category shared by every account (or a private one with global: false).
 * 409 when a category with this name already exists for the caller.
 */
router.post('/', userWriteLimiter, async (req: Request, res: Response) => {
  try {
    const data = createSchema.parse(req.body);
    const admin = await isAdminNow(req.user!.userId);
    if (data.global && !admin) throw new HttpError(403, 'Seul un administrateur peut créer une catégorie pour tous les comptes.');
    const global = admin && data.global !== false;
    const category = await categoryService.createCategory(req.user!.userId, data.name, { global });
    res.status(201).json(category);
  } catch (err: any) {
    if (sendKnownError(res, err)) return;
    console.error('[CATEGORIES] create failed:', err?.message ?? err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
