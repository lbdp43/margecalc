import { PrismaClient } from '@prisma/client';
import { DEFAULT_CATEGORIES } from '@margebar/shared';

const prisma = new PrismaClient();

const DEFAULT_SYSTEM_PARAMS = [
  {
    key: 'tarif_annee',
    value: '2026',
    label: 'Annee de reference des tarifs',
    unit: null,
    description: 'Annee des tarifs en vigueur, affichee sur le calculateur',
  },
  {
    key: 'tva_normal',
    value: '0.20',
    label: 'TVA taux normal',
    unit: '%',
    description: 'Taux de TVA normal applicable aux boissons alcoolisees (20%)',
  },
  {
    key: 'tva_soft',
    value: '0.10',
    label: 'TVA boissons non-alcoolisees',
    unit: '%',
    description: 'Taux de TVA applicable sur les boissons non-alcoolisees (consommation sur place)',
  },
  {
    key: 'tva_food',
    value: '0.10',
    label: 'TVA alimentation',
    unit: '%',
    description: 'Taux de TVA applicable sur la nourriture (consommation sur place)',
  },
  {
    key: 'seuil_cotisation_ss',
    value: '18',
    label: 'Seuil cotisation securite sociale',
    unit: '% vol.',
    description: 'Degre d\'alcool au-dessus duquel la cotisation securite sociale s\'applique',
  },
  {
    key: 'lien_reference',
    value: 'https://entreprendre.service-public.fr/vosdroits/F32101',
    label: 'Lien de reference officiel',
    unit: null,
    description: 'Lien vers la fiche officielle des droits d\'accise (Service Public)',
  },
];

// 13 fiscal categories with 2026 tariffs
const DEFAULT_RATES = [
  {
    slug: 'vin_tranquille',
    label: 'Vin tranquille',
    examples: 'Bordeaux, Cotes-du-Rhone, rose, blanc sec',
    calcType: 'A',
    acciseRate: 4.19,
    acciseUnit: 'euro/hl',
    cotisationRate: 0,
    cotisationUnit: null,
    cotisationCond: null,
    sortOrder: 1,
  },
  {
    slug: 'vin_mousseux',
    label: 'Vin mousseux',
    examples: 'Champagne, Cremant, Prosecco, Cava',
    calcType: 'A',
    acciseRate: 10.38,
    acciseUnit: 'euro/hl',
    cotisationRate: 0,
    cotisationUnit: null,
    cotisationCond: null,
    sortOrder: 2,
  },
  {
    slug: 'cidre_poire',
    label: 'Cidre / Poire',
    examples: 'Cidre brut, doux, poire, hydromel',
    calcType: 'A',
    acciseRate: 1.46,
    acciseUnit: 'euro/hl',
    cotisationRate: 0,
    cotisationUnit: null,
    cotisationCond: null,
    sortOrder: 3,
  },
  {
    slug: 'boisson_fermentee',
    label: 'Autre boisson fermentee',
    examples: 'Kombucha alcoolise, sake, kefir',
    calcType: 'A',
    acciseRate: 4.19,
    acciseUnit: 'euro/hl',
    cotisationRate: 0,
    cotisationUnit: null,
    cotisationCond: null,
    sortOrder: 4,
  },
  {
    slug: 'prod_interm_vdl_vdn',
    label: 'Porto / VDN / VDL',
    examples: 'Porto, Banyuls, Muscat, Rivesaltes',
    calcType: 'A',
    acciseRate: 52.39,
    acciseUnit: 'euro/hl',
    cotisationRate: 20.97,
    cotisationUnit: 'euro/hl',
    cotisationCond: '>18',
    sortOrder: 5,
  },
  {
    slug: 'prod_interm_autre',
    label: 'Vermouth / Aperitif vine',
    examples: 'Vermouth, Lillet, Byrrh, Pineau',
    calcType: 'A',
    acciseRate: 209.53,
    acciseUnit: 'euro/hl',
    cotisationRate: 52.39,
    cotisationUnit: 'euro/hl',
    cotisationCond: '>18',
    sortOrder: 6,
  },
  {
    slug: 'biere_legere',
    label: 'Biere legere',
    examples: 'Bieres sans alcool, panaches',
    calcType: 'B',
    acciseRate: 4.12,
    acciseUnit: 'euro/hl_degree',
    cotisationRate: 52.39,
    cotisationUnit: 'euro/hl',
    cotisationCond: '>18',
    sortOrder: 7,
  },
  {
    slug: 'biere',
    label: 'Biere',
    examples: 'IPA, lagers, stouts, blondes',
    calcType: 'B',
    acciseRate: 8.24,
    acciseUnit: 'euro/hl_degree',
    cotisationRate: 52.39,
    cotisationUnit: 'euro/hl',
    cotisationCond: '>18',
    sortOrder: 8,
  },
  {
    slug: 'petite_brasserie',
    label: 'Biere artisanale',
    examples: 'Micro-brasseries, brasseries craft',
    calcType: 'B',
    acciseRate: 4.12,
    acciseUnit: 'euro/hl_degree',
    cotisationRate: 52.39,
    cotisationUnit: 'euro/hl',
    cotisationCond: '>18',
    sortOrder: 9,
  },
  {
    slug: 'rhum_dom',
    label: 'Rhum des DOM',
    examples: 'Rhum agricole Martinique, Guadeloupe',
    calcType: 'C',
    acciseRate: 966.75,
    acciseUnit: 'euro/hlap',
    cotisationRate: 620.47,
    cotisationUnit: 'euro/hlap',
    cotisationCond: '>18',
    sortOrder: 10,
  },
  {
    slug: 'liqueur',
    label: 'Liqueur',
    examples: 'Liqueurs artisanales, cremes, elixirs',
    calcType: 'C',
    acciseRate: 1932.42,
    acciseUnit: 'euro/hlap',
    cotisationRate: 620.47,
    cotisationUnit: 'euro/hlap',
    cotisationCond: '>18',
    sortOrder: 11,
  },
  {
    slug: 'spiritueux',
    label: 'Spiritueux',
    examples: 'Whisky, vodka, gin, cognac, armagnac',
    calcType: 'C',
    acciseRate: 1932.42,
    acciseUnit: 'euro/hlap',
    cotisationRate: 620.47,
    cotisationUnit: 'euro/hlap',
    cotisationCond: '>18',
    sortOrder: 12,
  },
  {
    slug: 'rhum_hors_dom',
    label: 'Rhum (hors DOM)',
    examples: 'Rhum cubain, jamaicain, venezuelien',
    calcType: 'C',
    acciseRate: 1932.42,
    acciseUnit: 'euro/hlap',
    cotisationRate: 620.47,
    cotisationUnit: 'euro/hlap',
    cotisationCond: '>18',
    sortOrder: 13,
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
  // Remove old params that are now in rates table
  for (const oldKey of ['droit_accise', 'cotisation_secu', 'tva_alcool']) {
    await prisma.systemParam.deleteMany({ where: { key: oldKey } });
  }
  console.log('Seeded system params');

  // Seed rates (13 fiscal categories)
  for (const rate of DEFAULT_RATES) {
    await prisma.rate.upsert({
      where: { slug: rate.slug },
      update: {
        label: rate.label,
        examples: rate.examples,
        calcType: rate.calcType,
        acciseUnit: rate.acciseUnit,
        cotisationUnit: rate.cotisationUnit,
        cotisationCond: rate.cotisationCond,
        sortOrder: rate.sortOrder,
      },
      create: rate,
    });
  }
  console.log('Seeded 13 fiscal categories with 2026 tariffs');

  // Promote admin user
  const adminEmail = 'guillaumelbdp@gmail.com';
  const adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (adminUser && adminUser.role !== 'admin') {
    await prisma.user.update({
      where: { email: adminEmail },
      data: { role: 'admin' },
    });
    console.log(`Promoted ${adminEmail} to admin`);
  } else if (adminUser) {
    console.log(`${adminEmail} is already admin`);
  } else {
    console.log(`${adminEmail} not found yet`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
