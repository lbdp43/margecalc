import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import * as userService from '../services/user.service';

const router = Router();

const updateSchema = z.object({
  businessName: z.string().optional(),
  isAutoEntrepreneur: z.boolean().optional(),
  defaultTvaRate: z.number().min(0).max(1).optional(),
});

router.use(authenticate);

router.get('/me', async (req: Request, res: Response) => {
  try {
    const user = await userService.getUser(req.user!.userId);
    res.json(user);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

router.patch('/me', async (req: Request, res: Response) => {
  try {
    const data = updateSchema.parse(req.body);
    const user = await userService.updateUser(req.user!.userId, data);
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
