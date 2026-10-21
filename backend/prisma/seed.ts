import { PrismaClient } from '@prisma/client';
import { DEFAULT_CATEGORIES, DEFAULT_RATES } from '@margebar/shared';

/**
 * Runs on EVERY production start (railway.json startCommand), so it must be idempotent and
 * conservative:
 * - missing rows are created with the defaults;
 * - existing rows are only touched to fix a TEXT (label/description/examples) that still equals
 *   an old shipped default (e.g. the unaccented « Biere legere »);
 * - rates (acciseRate, cotisationRate) and param values are NEVER overwritten: admins edit them;
 * - nothing is written when nothing changed (keeps Rate.updatedAt meaningful).
 */
const prisma = new PrismaClient();

type Text = string | null;

/** New default text, applied only when the current value is one of `legacy` (or already equal). */
function fixedText(current: Text, next: Text, legacy: Text[]): Text | undefined {
  if (current === next) return undefined;
  if (legacy.includes(current)) return next;
  return undefined; // customised by an admin: keep it
}

const DEFAULT_SYSTEM_PARAMS: {
  key: string; value: string; label: string; unit: string | null; description: string | null;
  legacyLabels: string[]; legacyDescriptions: string[];
}[] = [
  {
    key: 'tarif_annee',
    value: '2026',
    label: 'Année de référence des tarifs',
    unit: null,
    description: 'Année des tarifs en vigueur, affichée sur le calculateur',
    legacyLabels: ['Annee de reference des tarifs'],
    legacyDescriptions: ['Annee des tarifs en vigueur, affichee sur le calculateur'],
  },
  {
    key: 'tva_normal',
    value: '0.20',
    label: 'TVA taux normal',
    unit: '%',
    description: 'Taux de TVA normal applicable aux boissons alcoolisées (20 %)',
    legacyLabels: [],
    legacyDescriptions: ['Taux de TVA normal applicable aux boissons alcoolisees (20%)'],
  },
  {
    key: 'tva_soft',
    value: '0.10',
    label: 'TVA boissons non alcoolisées',
    unit: '%',
    description: 'Taux de TVA applicable aux boissons non alcoolisées (consommation sur place)',
    legacyLabels: ['TVA boissons non-alcoolisees'],
    legacyDescriptions: ['Taux de TVA applicable sur les boissons non-alcoolisees (consommation sur place)'],
  },
  {
    key: 'tva_food',
    value: '0.10',
    label: 'TVA alimentation',
    unit: '%',
    description: 'Taux de TVA applicable à la nourriture (consommation sur place)',
    legacyLabels: [],
    legacyDescriptions: ['Taux de TVA applicable sur la nourriture (consommation sur place)'],
  },
  {
    key: 'seuil_cotisation_ss',
    value: '18',
    label: 'Seuil de la cotisation sécurité sociale',
    unit: '% vol.',
    description: 'Degré d’alcool au-dessus duquel la cotisation sécurité sociale s’applique',
    legacyLabels: ['Seuil cotisation securite sociale'],
    legacyDescriptions: ['Degre d\'alcool au-dessus duquel la cotisation securite sociale s\'applique'],
  },
  {
    key: 'lien_reference',
    value: 'https://entreprendre.service-public.fr/vosdroits/F32101',
    label: 'Lien de référence officiel',
    unit: null,
    description: 'Lien vers la fiche officielle des droits d’accise (Service Public)',
    legacyLabels: ['Lien de reference officiel'],
    legacyDescriptions: ['Lien vers la fiche officielle des droits d\'accise (Service Public)'],
  },
];

/** Texts shipped by previous versions (unaccented), per fiscal category slug. */
const LEGACY_RATE_TEXTS: Record<string, { labels: string[]; examples: string[] }> = {
  vin_tranquille: { labels: [], examples: ['Vins rouges, blancs, roses non effervescents — Bordeaux, Bourgogne, Cotes-du-Rhone...'] },
  vin_mousseux: { labels: [], examples: ['Vins effervescents — Champagne, Cremant, Prosecco, Cava, mousseux'] },
  cidre_poire: { labels: ['Cidre / Poire'], examples: ['Cidre brut, demi-sec, doux, poire, hydromel — tarif reduit'] },
  boisson_fermentee: { labels: ['Autre boisson fermentee'], examples: ['Boissons fermentees hors vin/biere — Kombucha alcoolise, sake, kefir, hydromel'] },
  prod_interm_vdl_vdn: { labels: [], examples: ['Vins doux naturels et de liqueur — Porto, Banyuls, Muscat, Rivesaltes (tarif reduit)'] },
  prod_interm_autre: { labels: ['Vermouth / Aperitif vine'], examples: ['Produits intermediaires a base de vin — Vermouth, Lillet, Byrrh, Pineau des Charentes'] },
  biere_legere: { labels: ['Biere legere (0,5% a 2,8%)'], examples: ['Panaches, bieres sans alcool, radlers — jusqu\'a 2,8% vol.'] },
  biere: { labels: ['Biere (plus de 2,8%)'], examples: ['IPA, lagers, stouts, blondes, ambrées — au-dessus de 2,8% vol.', 'IPA, lagers, stouts, blondes, ambrees — au-dessus de 2,8% vol.'] },
  petite_brasserie: { labels: ['Biere artisanale (petite brasserie)'], examples: ['Micro-brasseries, brasseries craft — production max 200 000 hl/an, tarif reduit'] },
  rhum_dom: { labels: [], examples: ['Rhum produit outre-mer (Martinique, Guadeloupe, Reunion) — tarif reduit de moitie'] },
  liqueur: { labels: [], examples: ['Liqueurs, cremes de fruits, elixirs, amaretto, limoncello, Chartreuse...'] },
  spiritueux: { labels: [], examples: ['Alcools forts distilles — Whisky, vodka, gin, cognac, armagnac, tequila, mezcal...'] },
  rhum_hors_dom: { labels: [], examples: ['Rhum d\'importation — cubain, jamaicain, venezuelien, philippin (tarif plein)'] },
};

/** Category names shipped by previous versions. */
const LEGACY_CATEGORY_NAMES: Record<string, string[]> = {
  bieres: ['Bieres'],
  ingredients_cocktails: ['Ingredients cocktails'],
};

async function seedCategories() {
  let created = 0;
  let fixed = 0;
  for (const cat of DEFAULT_CATEGORIES) {
    const existing = await prisma.category.findUnique({ where: { slug: cat.slug } });
    if (!existing) {
      await prisma.category.create({ data: { name: cat.name, slug: cat.slug, icon: cat.icon, sortOrder: cat.sortOrder } });
      created++;
      continue;
    }
    const name = fixedText(existing.name, cat.name, LEGACY_CATEGORY_NAMES[cat.slug] ?? []);
    const data: { name?: string; icon?: string } = {};
    if (name) data.name = name;
    if (!existing.icon && cat.icon) data.icon = cat.icon;
    if (Object.keys(data).length) {
      try {
        await prisma.category.update({ where: { id: existing.id }, data });
        fixed++;
      } catch (err: any) {
        console.warn(`Category ${cat.slug} not updated: ${err?.message}`);
      }
    }
  }
  console.log(`Seeded categories (${created} created, ${fixed} fixed)`);
}

async function seedSystemParams() {
  let created = 0;
  let fixed = 0;
  for (const p of DEFAULT_SYSTEM_PARAMS) {
    const existing = await prisma.systemParam.findUnique({ where: { key: p.key } });
    if (!existing) {
      await prisma.systemParam.create({ data: { key: p.key, value: p.value, label: p.label, unit: p.unit, description: p.description } });
      created++;
      continue;
    }
    // `value` is admin-editable: never touched here.
    const data: { label?: string; description?: string | null } = {};
    const label = fixedText(existing.label, p.label, p.legacyLabels);
    const description = fixedText(existing.description, p.description, [...p.legacyDescriptions, null]);
    if (label !== undefined && label !== null) data.label = label;
    if (description !== undefined) data.description = description;
    if (Object.keys(data).length) {
      await prisma.systemParam.update({ where: { key: p.key }, data });
      fixed++;
    }
  }
  // Remove old params that are now in rates table
  for (const oldKey of ['droit_accise', 'cotisation_secu', 'tva_alcool']) {
    await prisma.systemParam.deleteMany({ where: { key: oldKey } });
  }
  console.log(`Seeded system params (${created} created, ${fixed} texts fixed)`);
}

async function seedRates() {
  let created = 0;
  let fixed = 0;
  for (const rate of DEFAULT_RATES) {
    const existing = await prisma.rate.findUnique({ where: { slug: rate.slug } });
    if (!existing) {
      await prisma.rate.create({
        data: {
          slug: rate.slug,
          label: rate.label,
          examples: rate.examples,
          calcType: rate.calcType,
          acciseRate: rate.acciseRate,
          acciseUnit: rate.acciseUnit,
          cotisationRate: rate.cotisationRate,
          cotisationUnit: rate.cotisationUnit,
          cotisationCond: rate.cotisationCond,
          sortOrder: rate.sortOrder,
        },
      });
      created++;
      continue;
    }
    // acciseRate / cotisationRate are edited by admins (official tariffs): NEVER overwritten.
    const legacy = LEGACY_RATE_TEXTS[rate.slug] ?? { labels: [], examples: [] };
    const data: { label?: string; examples?: string | null } = {};
    const label = fixedText(existing.label, rate.label, legacy.labels);
    const examples = fixedText(existing.examples, rate.examples, [...legacy.examples, null]);
    if (label !== undefined && label !== null) data.label = label;
    if (examples !== undefined) data.examples = examples;
    if (Object.keys(data).length) {
      await prisma.rate.update({ where: { slug: rate.slug }, data });
      fixed++;
    }
  }
  console.log(`Seeded ${DEFAULT_RATES.length} fiscal categories (${created} created, ${fixed} texts fixed; rates untouched)`);
}

async function main() {
  await seedCategories();
  await seedSystemParams();
  await seedRates();

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
