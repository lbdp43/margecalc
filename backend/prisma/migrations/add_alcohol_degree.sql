-- Add alcoholDegree column to Product table
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "alcoholDegree" DOUBLE PRECISION NOT NULL DEFAULT 0;
