import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { AuthPayload } from '@margebar/shared';

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    console.warn(`[AUTH] Missing token — ${req.method} ${req.path} — IP: ${req.ip}`);
    res.status(401).json({ error: 'Token manquant' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    console.warn(`[AUTH] Invalid token — ${req.method} ${req.path} — IP: ${req.ip}`);
    res.status(401).json({ error: 'Token invalide' });
  }
}
