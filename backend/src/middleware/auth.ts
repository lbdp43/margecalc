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
  prisma.user
    .update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => {
      lastSeenWrites.delete(userId);
    });
}

// Evict stale entries every 30 minutes to prevent unbounded growth.
setInterval(() => {
  const cutoff = Date.now() - LAST_SEEN_DEBOUNCE_MS * 2;
  for (const [userId, ts] of lastSeenWrites) {
    if (ts < cutoff) lastSeenWrites.delete(userId);
  }
}, 30 * 60 * 1000).unref();

/**
 * Account status read from the DB (role + ban), cached 60 s per user: the JWT alone would keep a
 * demoted admin's rights, or a banned user's access, until the access token expires (1 h).
 */
interface AccountStatus { exists: boolean; role: 'user' | 'admin'; banned: boolean; at: number }
const STATUS_TTL_MS = 60 * 1000;
const statusCache = new Map<string, AccountStatus>();

setInterval(() => {
  const cutoff = Date.now() - STATUS_TTL_MS;
  for (const [userId, s] of statusCache) {
    if (s.at < cutoff) statusCache.delete(userId);
  }
}, 5 * 60 * 1000).unref();

async function readAccountStatus(userId: string): Promise<AccountStatus> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, bannedAt: true } });
  const status: AccountStatus = {
    exists: !!u,
    role: u?.role === 'admin' ? 'admin' : 'user',
    banned: !!u?.bannedAt,
    at: Date.now(),
  };
  statusCache.set(userId, status);
  return status;
}

async function accountStatus(userId: string): Promise<AccountStatus> {
  const cached = statusCache.get(userId);
  if (cached && Date.now() - cached.at < STATUS_TTL_MS) return cached;
  return readAccountStatus(userId);
}

/** Drop the cached status (call after a ban/unban/role change so it applies immediately). */
export function forgetAccountStatus(userId: string): void {
  statusCache.delete(userId);
}

const SUSPENDED = 'Compte suspendu : ce compte a été banni. Contactez La Brasserie des Plantes pour plus d’informations.';

/**
 * Valid access token + an account that still exists and is not banned (checked against the DB,
 * cached 60 s). `req.user.role` is the CURRENT role, not the one frozen in the token.
 * A banned or deleted account answers 401 (code 'banned' / 'account_missing'): the app then tries
 * to refresh the token, which is refused too, and signs the user out (login explains the ban).
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    console.warn(`[AUTH] Missing token — ${req.method} ${req.path} — IP: ${req.ip}`);
    res.status(401).json({ error: 'Token manquant' });
    return;
  }

  const token = header.slice(7);
  let payload: AuthPayload & { type?: string };
  try {
    payload = jwt.verify(token, config.jwtSecret) as AuthPayload & { type?: string };
  } catch {
    console.warn(`[AUTH] Invalid token — ${req.method} ${req.path} — IP: ${req.ip}`);
    res.status(401).json({ error: 'Token invalide' });
    return;
  }
  if (payload.type && payload.type !== 'access') {
    res.status(401).json({ error: 'Token invalide' });
    return;
  }

  let status: AccountStatus | null = null;
  try {
    status = await accountStatus(payload.userId);
  } catch (err: any) {
    // DB unreachable: the route itself will fail anyway — do not turn it into a fake auth error.
    console.warn('[AUTH] account status unavailable:', err?.message ?? err);
  }
  if (status && !status.exists) {
    res.status(401).json({ error: 'Ce compte n’existe plus. Reconnectez-vous.', code: 'account_missing' });
    return;
  }
  if (status?.banned) {
    res.status(401).json({ error: SUSPENDED, code: 'banned' });
    return;
  }
  req.user = { ...payload, role: status?.role ?? payload.role };
  touchLastSeen(payload.userId);
  next();
}

/** Admin routes: the role is re-read from the DB on every call (no cache, no token trust). */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Token manquant' });
    return;
  }
  let status: AccountStatus;
  try {
    status = await readAccountStatus(req.user.userId);
  } catch {
    res.status(503).json({ error: 'Service momentanément indisponible, réessayez.' });
    return;
  }
  if (!status.exists || status.banned || status.role !== 'admin') {
    res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    return;
  }
  req.user = { ...req.user, role: 'admin' };
  next();
}

/** Fresh (uncached) admin check, for routes where only part of the behaviour is admin-only. */
export async function isAdminNow(userId: string): Promise<boolean> {
  const status = await readAccountStatus(userId);
  return status.exists && !status.banned && status.role === 'admin';
}
