import { PrismaClient } from '@prisma/client';
import { DEFAULT_CATEGORIES } from '@margebar/shared';

const prisma = new PrismaClient();

async function main() {
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, icon: cat.icon, sortOrder: cat.sortOrder },
      create: { name: cat.name, slug: cat.slug, icon: cat.icon, sortOrder: cat.sortOrder },
    });
  }
  console.log('Seeded categories');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
