import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as authService from '../services/auth.service';

const router = Router();

const registerSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(6, 'Mot de passe: 6 caractères minimum'),
  businessName: z.string().optional(),
  isAutoEntrepreneur: z.boolean().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

router.post('/register', async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);
    const result = await authService.register(data.email, data.password, data.businessName, data.isAutoEntrepreneur);
    res.status(201).json(result);
  } catch (err: any) {
    const status = err.name === 'ZodError' ? 400 : 409;
    res.status(status).json({ error: err.message || 'Erreur inscription' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await authService.login(data.email, data.password);
    res.json(result);
  } catch (err: any) {
    const status = err.name === 'ZodError' ? 400 : 401;
    res.status(status).json({ error: err.message || 'Erreur connexion' });
  }
});

export default router;
