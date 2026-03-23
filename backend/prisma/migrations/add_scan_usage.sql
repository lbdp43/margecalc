-- CreateTable
CREATE TABLE "ScanUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanUsage_userId_scannedAt_idx" ON "ScanUsage"("userId", "scannedAt");

-- AddForeignKey
ALTER TABLE "ScanUsage" ADD CONSTRAINT "ScanUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
