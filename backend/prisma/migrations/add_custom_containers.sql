-- Create CustomContainer table (user-configurable container types: Bouteille 70cl, Fût 20L, etc.)
CREATE TABLE IF NOT EXISTS "CustomContainer" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "volumeCl" DOUBLE PRECISION NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomContainer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomContainer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CustomContainer_userId_idx" ON "CustomContainer"("userId");
