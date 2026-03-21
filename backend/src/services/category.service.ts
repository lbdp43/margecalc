import { prisma } from '../config/database';

export async function getCategories() {
  return prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
}
