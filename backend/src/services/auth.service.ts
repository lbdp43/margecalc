import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { config } from '../config/env';
import { AuthPayload } from '@margebar/shared';
import { formatUser } from './user.service';
import { HttpError } from '../utils/validation';

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '1h';
const REFRESH_TOKEN_EXPIRY = '30d';

/** Canonical form of an e-mail address: trimmed, lower case. New accounts are stored like this. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const EMAIL_TAKEN = 'Un compte existe déjà avec cette adresse e-mail.';

/**
 * Accounts whose e-mail matches `email` regardless of case, the exact (lower-case) one first.
 * Accounts created before e-mails were normalised keep their stored capitals (nothing is
 * rewritten: production may hold « Bar@x.fr » and « bar@x.fr » as two accounts), so the lookup
 * is case-insensitive instead. `email` must already be normalised.
 */
async function findAccountsByEmail(email: string) {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "User" WHERE lower("email") = ${email}
    ORDER BY ("email" = ${email}) DESC, "createdAt" ASC
    LIMIT 10`;
  if (!rows.length) return [];
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.id) } } });
  const rank = new Map(rows.map((r, i) => [r.id, i]));
  return users.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
}

export async function register(rawEmail: string, password: string, businessName?: string, isAutoEntrepreneur = false) {
  const email = normalizeEmail(rawEmail);
  // One mailbox = one account: « Bar@x.fr » is taken when « bar@x.fr » exists, and vice versa.
  const existing = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "User" WHERE lower("email") = ${email} LIMIT 1`;
  if (existing.length) throw new HttpError(409, EMAIL_TAKEN, { code: 'email_taken' });

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  let user;
  try {
    user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        businessName: businessName?.trim() || null,
        isAutoEntrepreneur,
        defaultTvaRate: isAutoEntrepreneur ? 0 : 0.20,
      },
    });
  } catch (err) {
    // Same address registered concurrently (unique index on email).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new HttpError(409, EMAIL_TAKEN, { code: 'email_taken' });
    }
    throw err;
  }

  const payload: AuthPayload = { userId: user.id, email: user.email, role: user.role as 'user' | 'admin' };
  return {
    token: signAccessToken(payload),
    refreshToken: signRefreshToken(payload.userId),
    user: formatUser(user),
  };
}

export class BannedAccountError extends Error {
  constructor() {
    super('Ce compte a été banni. Contactez La Brasserie des Plantes pour plus d\'informations.');
    this.name = 'BannedAccountError';
  }
}

/** Wrong e-mail or password (the route answers 401 with this message). */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('E-mail ou mot de passe incorrect.');
    this.name = 'InvalidCredentialsError';
  }
}

export async function login(rawEmail: string, password: string) {
  const email = normalizeEmail(rawEmail);
  // Usually one account (or none). With legacy case-duplicates, the one whose password matches.
  let user = null;
  for (const candidate of await findAccountsByEmail(email)) {
    if (await bcrypt.compare(password, candidate.passwordHash)) {
      user = candidate;
      break;
    }
  }
  if (!user) {
    throw new InvalidCredentialsError();
  }

  if (user.bannedAt) {
    throw new BannedAccountError();
  }

  // Bump the monthly login counter (one row per user per calendar month).
  // Async fire-and-forget — login response is not blocked by this counter.
  trackMonthlyLogin(user.id).catch((err) => {
    console.warn('[AUTH] monthly login bump failed', err?.message ?? err);
  });

  const payload: AuthPayload = { userId: user.id, email: user.email, role: user.role as 'user' | 'admin' };
  return {
    token: signAccessToken(payload),
    refreshToken: signRefreshToken(payload.userId),
    user: formatUser(user),
  };
}

function startOfCurrentMonthUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

async function trackMonthlyLogin(userId: string): Promise<void> {
  const month = startOfCurrentMonthUTC();
  await prisma.userMonthlyLogin.upsert({
    where: { userId_month: { userId, month } },
    create: { userId, month, count: 1 },
    update: { count: { increment: 1 } },
  });
}

export async function refreshAccessToken(refreshToken: string) {
  let decoded: { userId: string; type: string };
  try {
    decoded = jwt.verify(refreshToken, config.jwtSecret) as typeof decoded;
  } catch {
    throw new Error('Refresh token invalide');
  }

  if (decoded.type !== 'refresh') {
    throw new Error('Token invalide');
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user) {
    throw new Error('Utilisateur introuvable');
  }
  if (user.bannedAt) {
    throw new BannedAccountError();
  }

  const payload: AuthPayload = { userId: user.id, email: user.email, role: user.role as 'user' | 'admin' };
  return {
    token: signAccessToken(payload),
    refreshToken: signRefreshToken(payload.userId),
    user: formatUser(user),
  };
}

function signAccessToken(payload: AuthPayload): string {
  return jwt.sign({ ...payload, type: 'access' }, config.jwtSecret, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

function signRefreshToken(userId: string): string {
  return jwt.sign({ userId, type: 'refresh' }, config.jwtSecret, { expiresIn: REFRESH_TOKEN_EXPIRY });
}
