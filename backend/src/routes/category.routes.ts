import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import * as categoryService from '../services/category.service';

const router = Router();

router.use(authenticate);

router.get('/', async (_req: Request, res: Response) => {
  try {
    const categories = await categoryService.getCategories();
    res.json(categories);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
