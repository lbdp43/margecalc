import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as authService from '../services/auth.service';

const router = Router();

const registerSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Mot de passe: 8 caractères minimum'),
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
    if (err.name === 'ZodError') {
      res.status(400).json({ error: err.message });
    } else {
      // Known: "Un compte existe déjà avec cet email"
      res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
    }
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await authService.login(data.email, data.password);
    res.json(result);
  } catch (err: any) {
    if (err.name === 'ZodError') {
      res.status(400).json({ error: err.message });
    } else {
      res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
  }
});

export default router;
