-- CreateTable
CREATE TABLE "UserMonthlyLogin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMonthlyLogin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserMonthlyLogin_userId_month_key" ON "UserMonthlyLogin"("userId", "month");

-- CreateIndex
CREATE INDEX "UserMonthlyLogin_month_idx" ON "UserMonthlyLogin"("month");

-- AddForeignKey
ALTER TABLE "UserMonthlyLogin" ADD CONSTRAINT "UserMonthlyLogin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
