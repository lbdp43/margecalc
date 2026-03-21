-- Add defaultContainerVolumeCl to User table (defaults to 70cl)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "defaultContainerVolumeCl" DOUBLE PRECISION NOT NULL DEFAULT 70;
