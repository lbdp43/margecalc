-- Private categories per user (POST /api/categories no longer adds to every account's picker).
-- Existing rows keep userId NULL = built-in categories shared by everyone, so nothing is rewritten.
-- Safe for `prisma migrate deploy` in production: one nullable column + index swaps.
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "userId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Names/slugs were globally unique; they are now unique per owner.
DROP INDEX IF EXISTS "Category_name_key";
DROP INDEX IF EXISTS "Category_slug_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Category_userId_slug_key" ON "Category"("userId", "slug");
CREATE INDEX IF NOT EXISTS "Category_userId_idx" ON "Category"("userId");
-- Built-in categories (userId NULL) stay unique by slug and by name (NULLs are distinct in the index above).
CREATE UNIQUE INDEX IF NOT EXISTS "Category_builtin_slug_key" ON "Category"("slug") WHERE "userId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Category_builtin_name_key" ON "Category"("name") WHERE "userId" IS NULL;
