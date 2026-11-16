-- AlterTable
ALTER TABLE "ExchangeRate" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "unavailable" BOOLEAN NOT NULL DEFAULT false;
