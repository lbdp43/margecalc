import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';
import { HttpError, isZodError, validationErrorBody } from '../utils/validation';

/**
 * Last-resort error handler. Keeps the status of body-parser errors (413, 400…) instead of
 * turning everything into a 500, and always answers with a readable French `error`.
 */
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    res.end();
    return;
  }

  // Body too large (express.json limit) — typically a full-resolution photo.
  if (err?.type === 'entity.too.large' || err?.status === 413 || err?.statusCode === 413) {
    console.warn(`[HTTP] 413 ${req.method} ${req.originalUrl} (${err?.length ?? '?'} octets, limite ${err?.limit ?? '?'})`);
    res.status(413).json({ error: 'Photo trop volumineuse' });
    return;
  }

  // Malformed JSON body
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Requête invalide : le contenu envoyé n’est pas du JSON valide.' });
    return;
  }

  if (isZodError(err)) {
    res.status(400).json(validationErrorBody(err));
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...err.extra });
    return;
  }

  // Other 4xx raised by middlewares (encoding.unsupported, charset.unsupported, …)
  const status = Number(err?.status ?? err?.statusCode);
  if (status >= 400 && status < 500) {
    res.status(status).json({ error: 'Requête invalide.' });
    return;
  }

  if (config.isProd) {
    // In production, log only a summary — no stack traces
    console.error(`[ERROR] ${req.method} ${req.originalUrl}: ${err?.message ?? err}`);
  } else {
    console.error(err?.stack ?? err);
  }
  res.status(500).json({ error: 'Erreur interne du serveur' });
}
