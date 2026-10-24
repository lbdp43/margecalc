-- Lot 2: « prix à vérifier » flag on products and invoice labels remembered per supplier.
--
-- Safe for `prisma migrate deploy` on production data:
--   - one BOOLEAN column with a constant default: PostgreSQL 11+ stores the default in the catalog,
--     so no row is rewritten and every existing product reads false (nothing to review);
--   - one new, empty table with its indexes and foreign keys.
-- No existing row is updated or deleted. Every statement is idempotent (IF NOT EXISTS / duplicate_object),
-- so a partially applied run can be resolved and re-run. Prisma runs this file as one transaction.

-- Product.priceToReview: true when an invoice import created the product with a derived selling price
-- (purchase ×4); cleared as soon as the owner sets a selling or serving price.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "priceToReview" BOOLEAN NOT NULL DEFAULT false;

-- InvoiceAlias: (user, supplier, normalised invoice label + container) → product.
CREATE TABLE IF NOT EXISTS "InvoiceAlias" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "supplierKey" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceAlias_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InvoiceAlias_productId_idx" ON "InvoiceAlias"("productId");
CREATE UNIQUE INDEX IF NOT EXISTS "InvoiceAlias_userId_supplierKey_nameKey_key" ON "InvoiceAlias"("userId", "supplierKey", "nameKey");

DO $$ BEGIN
  ALTER TABLE "InvoiceAlias" ADD CONSTRAINT "InvoiceAlias_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "InvoiceAlias" ADD CONSTRAINT "InvoiceAlias_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
