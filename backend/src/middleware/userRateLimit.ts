import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request } from 'express';

/**
 * Rate limiter per authenticated user (keyed by userId instead of IP).
 * Prevents a single user from spamming write endpoints, while leaving room to enter a
 * whole catalogue in one session (each product = create + servings).
 */
export const userWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 300, // max 300 write operations per 15 min per user
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => (req.user?.userId ? `user:${req.user.userId}` : `ip:${ipKeyGenerator(req.ip || '0.0.0.0')}`),
  message: { error: 'Trop de modifications, réessayez dans quelques minutes.' },
});

/**
 * Invoice preview (POST /api/products/import/preview): matching an invoice against the catalogue is
 * CPU work on the only Node process, so it gets its own budget per user. A scan → review → re-check
 * session needs a handful; 60 per 15 min leaves room for many invoices.
 */
export const invoicePreviewLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => (req.user?.userId ? `user:${req.user.userId}` : `ip:${ipKeyGenerator(req.ip || '0.0.0.0')}`),
  message: { error: 'Trop d’analyses de factures, réessayez dans quelques minutes.' },
});
