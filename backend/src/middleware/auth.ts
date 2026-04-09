import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { prisma } from '../config/database';
import { AuthPayload } from '@margebar/shared';

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

// Debounced tracking of lastSeenAt — at most one DB write per user per 5 minutes.
// Kept in-memory; worst case we write a second time after a restart, which is fine.
const LAST_SEEN_DEBOUNCE_MS = 5 * 60 * 1000;
const lastSeenWrites = new Map<string, number>();
function touchLastSeen(userId: string): void {
  const now = Date.now();
  const lastWrite = lastSeenWrites.get(userId) || 0;
  if (now - lastWrite < LAST_SEEN_DEBOUNCE_MS) return;
  lastSeenWrites.set(userId, now);
  // Fire and forget — do not block the request on this.
  prisma.user
    .update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => {
      // Allow retry on the next request if the write failed.
      lastSeenWrites.delete(userId);
    });
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
    touchLastSeen(payload.userId);
    next();
  } catch {
    console.warn(`[AUTH] Invalid token — ${req.method} ${req.path} — IP: ${req.ip}`);
    res.status(401).json({ error: 'Token invalide' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    return;
  }
  next();
}
