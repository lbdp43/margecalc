-- Data-only migration that follows 0005_user_categories. It adds no columns and no indexes.
--
-- 1) Legacy categories made private.
--    Before 0005, POST /api/categories added every category a user created to EVERY account.
--    0005 left those rows with "userId" NULL, so they would still be treated as built-in.
--    Only the 6 seeded categories (DEFAULT_CATEGORIES in @margebar/shared) stay built-in.
--    Every other built-in row is a legacy one, handled by who uses it:
--      - products of ONE account: the row becomes that account's private category (same id);
--      - products of SEVERAL accounts: each one gets its own private copy and its products are moved to it;
--      - no product: left untouched (still shared by every account, exactly as before).
--    Only the emptied originals of 1b are deleted; no product ever loses its category.
--    A category an admin really meant for everyone, and that is in use, becomes private to its users:
--    the admin can recreate it as a shared category from Réglages. Report to see what will change:
--      SELECT c.name, c.slug, count(p.id) AS products, count(DISTINCT p."userId") AS accounts
--      FROM "Category" c LEFT JOIN "Product" p ON p."categoryId" = c.id
--      WHERE c."userId" IS NULL AND c.slug NOT IN ('spiritueux','vins','bieres','softs','ingredients_cocktails','consommables')
--      GROUP BY c.id ORDER BY 1;
--
-- 2) Unusable stored photos cleared.
--    The rule is the one POST/PUT /api/products enforces:
--      - imageUrl must be a jpeg/png/webp data URI of at most 300 000 chars, or an https URL;
--      - thumbnailUrl must be the same kind of value, at most 40 000 chars.
--    A blob:/file:/http: value, or a corrupt or oversized data URI, left the product page with an empty
--    photo card. Clearing it gives the « Ajouter une photo » layout instead.
--
-- Prisma runs this file as one implicit transaction: all of it applies, or none of it.

CREATE TEMP TABLE "_legacy_category" AS
SELECT c.id, c.slug,
       array_agg(DISTINCT p."userId") FILTER (WHERE p."userId" IS NOT NULL) AS users
FROM "Category" c
LEFT JOIN "Product" p ON p."categoryId" = c.id
WHERE c."userId" IS NULL
  AND c.slug NOT IN ('spiritueux', 'vins', 'bieres', 'softs', 'ingredients_cocktails', 'consommables')
GROUP BY c.id, c.slug;

-- 1a) Used by one account (and that account has no private category with this slug yet): the row becomes theirs.
UPDATE "Category" c
SET "userId" = l.users[1]
FROM "_legacy_category" l
WHERE c.id = l.id
  AND cardinality(l.users) = 1
  AND NOT EXISTS (SELECT 1 FROM "Category" o WHERE o."userId" = l.users[1] AND o.slug = l.slug);

-- 1b) Still built-in and used by several accounts (or by an account that already owns this slug):
--     one private copy per account, then the products are moved to their owner's copy.
INSERT INTO "Category" (id, name, slug, icon, "sortOrder", "userId")
SELECT gen_random_uuid()::text, c.name, c.slug, c.icon, c."sortOrder", u.uid
FROM "_legacy_category" l
JOIN "Category" c ON c.id = l.id AND c."userId" IS NULL
CROSS JOIN LATERAL unnest(l.users) AS u(uid)
ON CONFLICT ("userId", "slug") DO NOTHING;

UPDATE "Product" p
SET "categoryId" = n.id
FROM "_legacy_category" l
JOIN "Category" c ON c.id = l.id AND c."userId" IS NULL
JOIN "Category" n ON n.slug = l.slug AND n."userId" IS NOT NULL
WHERE p."categoryId" = l.id
  AND n."userId" = p."userId";

-- 1c) A legacy row whose products were all moved to private copies in 1b is now empty: every account
--     that used it has its own copy, so it is removed (otherwise each of them would see the name twice).
--     Legacy rows that never had any product are kept as they are (shared, as before): a deploy must
--     never delete data whose intent cannot be checked.
DELETE FROM "Category" c
USING "_legacy_category" l
WHERE c.id = l.id
  AND c."userId" IS NULL
  AND cardinality(l.users) >= 1
  AND NOT EXISTS (SELECT 1 FROM "Product" p WHERE p."categoryId" = c.id);

DROP TABLE "_legacy_category";

-- 2) Unusable photos (same rules as the API validation).
UPDATE "Product"
SET "imageUrl" = NULL, "thumbnailUrl" = NULL
WHERE "imageUrl" IS NOT NULL
  AND NOT (
    (length("imageUrl") <= 300000 AND "imageUrl" ~ '^data:image/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$')
    OR (length("imageUrl") <= 2048 AND "imageUrl" ~ '^https://\S+$')
  );

UPDATE "Product"
SET "thumbnailUrl" = NULL
WHERE "thumbnailUrl" IS NOT NULL
  AND NOT (
    (length("thumbnailUrl") <= 40000 AND "thumbnailUrl" ~ '^data:image/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$')
    OR (length("thumbnailUrl") <= 2048 AND "thumbnailUrl" ~ '^https://\S+$')
  );
