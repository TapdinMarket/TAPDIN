-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "clientCurrency" TEXT,
ADD COLUMN     "clientPrice" DECIMAL(14,2);
