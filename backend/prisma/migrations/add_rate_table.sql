-- Create Rate table for fiscal categories and tax rates
CREATE TABLE IF NOT EXISTS "Rate" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "slug" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "examples" TEXT,
  "calcType" TEXT NOT NULL,
  "acciseRate" DOUBLE PRECISION NOT NULL,
  "acciseUnit" TEXT NOT NULL,
  "cotisationRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cotisationUnit" TEXT,
  "cotisationCond" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Rate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Rate_slug_key" ON "Rate"("slug");
