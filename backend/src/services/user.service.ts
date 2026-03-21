import { prisma } from '../config/database';

export async function getUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('Utilisateur non trouvé');
  return {
    id: user.id,
    email: user.email,
    businessName: user.businessName,
    isAutoEntrepreneur: user.isAutoEntrepreneur,
    defaultTvaRate: user.defaultTvaRate,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function updateUser(userId: string, data: { businessName?: string; isAutoEntrepreneur?: boolean; defaultTvaRate?: number }) {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
  });
  return {
    id: user.id,
    email: user.email,
    businessName: user.businessName,
    isAutoEntrepreneur: user.isAutoEntrepreneur,
    defaultTvaRate: user.defaultTvaRate,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
