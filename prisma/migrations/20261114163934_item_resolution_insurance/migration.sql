-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "resolution" TEXT;

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "insuranceAzn" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "insured" BOOLEAN NOT NULL DEFAULT false;
