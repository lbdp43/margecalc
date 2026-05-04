-- Add role column to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'user';

-- Create SystemParam table for admin-managed configuration values
CREATE TABLE IF NOT EXISTS "SystemParam" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "unit" TEXT,
  "description" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SystemParam_pkey" PRIMARY KEY ("id")
);

-- Unique index on key
CREATE UNIQUE INDEX IF NOT EXISTS "SystemParam_key_key" ON "SystemParam"("key");
