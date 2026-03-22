import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { config } from '../config/env';
import { AuthPayload } from '@margebar/shared';
import { formatUser } from './user.service';

const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = '24h';

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

  const token = signToken({ userId: user.id, email: user.email });
  return { token, user: formatUser(user) };
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

  const token = signToken({ userId: user.id, email: user.email });
  return { token, user: formatUser(user) };
}

function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: TOKEN_EXPIRY });
}
