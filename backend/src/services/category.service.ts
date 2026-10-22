import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { HttpError } from '../utils/validation';

/**
 * Categories visible to a user: the built-in ones (userId null, shared by every account) and
 * the user's own private ones. Built-in first, in their seeded order.
 */
export async function getCategories(userId: string) {
  const rows = await prisma.category.findMany({
    where: { OR: [{ userId: null }, { userId }] },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.sort((a, b) => Number(a.userId !== null) - Number(b.userId !== null) || a.sortOrder - b.sortOrder);
}

/** Max private categories per account (each one shows up in the product form picker). */
export const MAX_USER_CATEGORIES = 30;

const DUPLICATE = 'Une catégorie porte déjà ce nom.';

export function slugify(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}

/**
 * Create a category.
 * - `global: true` (admins only): a built-in category added to every account's picker.
 * - otherwise: a private category of `userId`, invisible to other accounts.
 * A name already visible to the owner (built-in or own, case/accents ignored) is a 409.
 */
export async function createCategory(userId: string, name: string, opts: { global?: boolean } = {}) {
  const ownerId = opts.global ? null : userId;
  const slug = slugify(name);
  if (!slug) throw new HttpError(400, 'Le nom de la catégorie doit contenir au moins une lettre ou un chiffre.', { field: 'name' });

  try {
    return await prisma.$transaction(async (tx) => {
      // One creation at a time per owner: the duplicate check below cannot race.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`category|${ownerId ?? 'builtin'}`}))`;
      const visible = await tx.category.findMany({
        // A built-in category must not collide with anyone's private one either.
        where: ownerId ? { OR: [{ userId: null }, { userId: ownerId }] } : {},
        select: { slug: true, userId: true },
      });
      if (visible.some((c) => c.slug === slug)) throw new HttpError(409, DUPLICATE);
      if (ownerId && visible.filter((c) => c.userId === ownerId).length >= MAX_USER_CATEGORIES) {
        throw new HttpError(400, `Vous avez atteint la limite de ${MAX_USER_CATEGORIES} catégories personnelles.`, { field: 'name' });
      }
      return tx.category.create({ data: { name, slug, icon: '', sortOrder: 99, userId: ownerId } });
    });
  } catch (err) {
    // Unique index (userId, slug) / built-in name or slug: a concurrent duplicate.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new HttpError(409, DUPLICATE);
    throw err;
  }
}
