import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as authService from '../services/auth.service';
import { BannedAccountError, InvalidCredentialsError } from '../services/auth.service';
import { sendKnownError } from '../utils/validation';

const router = Router();

const registerSchema = z.object({
  email: z.string().trim().max(254, 'Adresse e-mail trop longue.').email('Adresse e-mail invalide.'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.').max(200),
  businessName: z.string().optional(),
  isAutoEntrepreneur: z.boolean().optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email('Adresse e-mail invalide.'),
  password: z.string().min(1, 'Le mot de passe est obligatoire.'),
});

router.post('/register', async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body);
    const result = await authService.register(data.email, data.password, data.businessName, data.isAutoEntrepreneur);
    res.status(201).json(result);
  } catch (err: any) {
    // 400 validation, 409 address already used (HttpError from the service).
    if (sendKnownError(res, err)) return;
    // Anything else (database down…) is NOT « account exists »: say it is temporary.
    console.error('[AUTH] register failed:', err?.message ?? err);
    res.status(500).json({ error: 'Impossible de créer le compte pour le moment. Réessayez dans un instant.' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await authService.login(data.email, data.password);
    res.json(result);
  } catch (err: any) {
    if (sendKnownError(res, err)) return;
    if (err instanceof BannedAccountError) {
      res.status(403).json({ error: err.message, code: 'banned' });
    } else if (err instanceof InvalidCredentialsError) {
      res.status(401).json({ error: err.message });
    } else {
      console.error('[AUTH] login failed:', err?.message ?? err);
      res.status(500).json({ error: 'Connexion impossible pour le moment. Réessayez dans un instant.' });
    }
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (typeof refreshToken !== 'string' || !refreshToken) {
      return res.status(400).json({ error: 'Refresh token manquant' });
    }
    const result = await authService.refreshAccessToken(refreshToken);
    res.json(result);
  } catch {
    res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter' });
  }
});

export default router;
