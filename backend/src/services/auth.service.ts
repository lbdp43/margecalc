import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { config } from '../config/env';
import { AuthPayload } from '@margebar/shared';
import { formatUser } from './user.service';

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '1h';
const REFRESH_TOKEN_EXPIRY = '30d';

export async function register(email: string, password: string, businessName?: string, isAutoEntrepreneur = false) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error('Un compte existe déjà avec cet email');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      businessName: businessName || null,
      isAutoEntrepreneur,
      defaultTvaRate: isAutoEntrepreneur ? 0 : 0.20,
    },
  });

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

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error('Email ou mot de passe incorrect');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error('Email ou mot de passe incorrect');
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
