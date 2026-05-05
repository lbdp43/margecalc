import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import * as userService from '../services/user.service';

const router = Router();

const updateSchema = z.object({
  businessName: z.string().optional(),
  isAutoEntrepreneur: z.boolean().optional(),
  defaultTvaRate: z.number().min(0).max(1).optional(),
  defaultContainerVolumeCl: z.number().positive().optional(),
});

router.use(authenticate);

router.get('/me', async (req: Request, res: Response) => {
  try {
    const user = await userService.getUser(req.user!.userId);
    res.json(user);
  } catch {
    res.status(404).json({ error: 'Utilisateur non trouvé' });
  }
});

router.patch('/me', async (req: Request, res: Response) => {
  try {
    const data = updateSchema.parse(req.body);
    const user = await userService.updateUser(req.user!.userId, data);
    res.json(user);
  } catch (err: any) {
    const status = err.name === 'ZodError' ? 400 : 500;
    res.status(status).json({ error: err.name === 'ZodError' ? err.message : 'Erreur serveur' });
  }
});

// Delete all user data (products, recipes, etc.) — keeps the account
router.delete('/me/data', async (req: Request, res: Response) => {
  try {
    await userService.deleteUserData(req.user!.userId);
    res.json({ success: true });
  } catch (err) {
    console.error('[USER] Error deleting user data:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
