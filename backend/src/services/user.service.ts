import { prisma } from '../config/database';

export function formatUser(user: {
  id: string; email: string; role: string; businessName: string | null;
  isAutoEntrepreneur: boolean; defaultTvaRate: number; defaultContainerVolumeCl: number;
  subscriptionStatus: string; subscriptionPlan: string | null;
  subscriptionEndDate: Date | null; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    role: user.role as 'user' | 'admin',
    businessName: user.businessName,
    isAutoEntrepreneur: user.isAutoEntrepreneur,
    defaultTvaRate: user.defaultTvaRate,
    defaultContainerVolumeCl: user.defaultContainerVolumeCl,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionPlan: user.subscriptionPlan,
    subscriptionEndDate: user.subscriptionEndDate?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function getUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('Utilisateur non trouvé');
  return formatUser(user);
}

export async function updateUser(userId: string, data: { businessName?: string; isAutoEntrepreneur?: boolean; defaultTvaRate?: number; defaultContainerVolumeCl?: number }) {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
  });
  return formatUser(user);
}

export async function deleteUserData(userId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.recipeConsumable.deleteMany({ where: { recipe: { userId } } });
    await tx.recipeIngredient.deleteMany({ where: { recipe: { userId } } });
    await tx.recipe.deleteMany({ where: { userId } });
    await tx.productServing.deleteMany({ where: { product: { userId } } });
    await tx.priceHistory.deleteMany({ where: { product: { userId } } });
    await tx.product.deleteMany({ where: { userId } });
    await tx.servingType.deleteMany({ where: { userId } });
    await tx.customContainer.deleteMany({ where: { userId } });
    await tx.scanUsage.deleteMany({ where: { userId } });
    await tx.ticket.deleteMany({ where: { userId } });
  });
}
