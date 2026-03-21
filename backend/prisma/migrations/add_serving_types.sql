-- Create ServingType table (user-configurable serving types: Shot, Demi, Pinte, etc.)
CREATE TABLE IF NOT EXISTS "ServingType" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "volumeCl" DOUBLE PRECISION NOT NULL,
  "icon" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServingType_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServingType_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ServingType_userId_idx" ON "ServingType"("userId");

-- Create ProductServing table (selling price per serving type per product)
CREATE TABLE IF NOT EXISTS "ProductServing" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "productId" TEXT NOT NULL,
  "servingTypeId" TEXT NOT NULL,
  "sellingPriceTTC" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductServing_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductServing_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductServing_servingTypeId_fkey" FOREIGN KEY ("servingTypeId") REFERENCES "ServingType"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProductServing_productId_servingTypeId_key" ON "ProductServing"("productId", "servingTypeId");
CREATE INDEX IF NOT EXISTS "ProductServing_productId_idx" ON "ProductServing"("productId");
