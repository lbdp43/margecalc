import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (config.isProd) {
    // In production, log only a summary — no stack traces
    console.error(`[ERROR] ${err.message}`);
  } else {
    console.error(err.stack);
  }
  res.status(500).json({ error: 'Erreur interne du serveur' });
}
