import { PrismaClient } from '@prisma/client';
import { CONTAINER_PRESETS } from '@margebar/shared';

const prisma = new PrismaClient();

export async function getContainers(userId: string) {
  let containers = await prisma.customContainer.findMany({
    where: { userId },
    orderBy: { sortOrder: 'asc' },
  });

  // Auto-create from presets on first access
  if (containers.length === 0) {
    await prisma.customContainer.createMany({
      data: CONTAINER_PRESETS.map((c, index) => ({
        userId,
        name: c.label,
        volumeCl: c.volumeCl,
        sortOrder: index,
      })),
    });
    containers = await prisma.customContainer.findMany({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  return containers;
}

export async function createContainer(
  userId: string,
  data: { name: string; volumeCl: number; sortOrder?: number },
) {
  return prisma.customContainer.create({
    data: {
      userId,
      name: data.name,
      volumeCl: data.volumeCl,
      sortOrder: data.sortOrder ?? 0,
    },
  });
}

export async function updateContainer(
  userId: string,
  id: string,
  data: { name?: string; volumeCl?: number; sortOrder?: number },
) {
  const result = await prisma.customContainer.updateMany({
    where: { id, userId },
    data,
  });

  if (result.count === 0) {
    return null;
  }

  return prisma.customContainer.findUnique({ where: { id } });
}

export async function deleteContainer(userId: string, id: string) {
  const result = await prisma.customContainer.deleteMany({
    where: { id, userId },
  });

  return result.count > 0;
}
