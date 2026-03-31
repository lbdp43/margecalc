import { PrismaClient } from '@prisma/client';
import { DEFAULT_CATEGORIES } from '@margebar/shared';

const prisma = new PrismaClient();

const DEFAULT_SYSTEM_PARAMS = [
  {
    key: 'droit_accise',
    value: '1837.44',
    label: "Droit d'accise",
    unit: '€/hlAP',
    description: "Droit d'accise sur les alcools, fixé par l'État (€ par hectolitre d'alcool pur)",
  },
  {
    key: 'cotisation_secu',
    value: '597.41',
    label: 'Cotisation sécurité sociale',
    unit: '€/hlAP',
    description: "Cotisation de sécurité sociale sur les alcools (€ par hectolitre d'alcool pur)",
  },
  {
    key: 'tva_alcool',
    value: '0.20',
    label: 'TVA alcool',
    unit: '%',
    description: 'Taux de TVA applicable sur les boissons alcoolisées',
  },
  {
    key: 'tva_soft',
    value: '0.10',
    label: 'TVA boissons non-alcoolisées',
    unit: '%',
    description: 'Taux de TVA applicable sur les boissons non-alcoolisées (consommation sur place)',
  },
  {
    key: 'tva_food',
    value: '0.10',
    label: 'TVA alimentation',
    unit: '%',
    description: 'Taux de TVA applicable sur la nourriture (consommation sur place)',
  },
];

async function main() {
  // Seed categories
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, icon: cat.icon, sortOrder: cat.sortOrder },
      create: { name: cat.name, slug: cat.slug, icon: cat.icon, sortOrder: cat.sortOrder },
    });
  }
  console.log('Seeded categories');

  // Seed system params
  for (const param of DEFAULT_SYSTEM_PARAMS) {
    await prisma.systemParam.upsert({
      where: { key: param.key },
      update: { label: param.label, unit: param.unit, description: param.description },
      create: param,
    });
  }
  console.log('Seeded system params');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
