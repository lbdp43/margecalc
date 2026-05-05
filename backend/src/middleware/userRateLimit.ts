import rateLimit from 'express-rate-limit';
import { Request } from 'express';

/**
 * Rate limiter per authenticated user (keyed by userId instead of IP).
 * Prevents a single user from spamming write endpoints.
 */
export const userWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // max 100 write operations per 15 min per user
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.userId || req.ip || 'anonymous',
  message: { error: 'Trop de modifications, réessayez dans quelques minutes' },
});
