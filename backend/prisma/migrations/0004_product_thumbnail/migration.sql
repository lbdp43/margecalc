-- Product photo thumbnail (small data URI shown in product lists).
-- Nullable, no default, no rewrite of existing rows: safe for `prisma migrate deploy` in production.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "thumbnailUrl" TEXT;
