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

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error('Email ou mot de passe incorrect');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new Error('Email ou mot de passe incorrect');
  }

  const payload: AuthPayload = { userId: user.id, email: user.email, role: user.role as 'user' | 'admin' };
  return {
    token: signAccessToken(payload),
    refreshToken: signRefreshToken(payload.userId),
    user: formatUser(user),
  };
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
