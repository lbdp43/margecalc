import { prisma } from '../config/database';

export async function getCategories() {
  return prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
}

export async function createCategory(data: { name: string; slug: string; icon: string; sortOrder: number }) {
  return prisma.category.create({ data });
}
