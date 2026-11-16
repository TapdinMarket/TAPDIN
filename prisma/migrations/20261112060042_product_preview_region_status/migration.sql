-- CreateEnum
CREATE TYPE "RegionStatus" AS ENUM ('ACTIVE', 'COMING_SOON');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "previewCurrency" TEXT,
ADD COLUMN     "previewFetchedAt" TIMESTAMP(3),
ADD COLUMN     "previewImageUrl" TEXT,
ADD COLUMN     "previewPrice" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "Region" ADD COLUMN     "status" "RegionStatus" NOT NULL DEFAULT 'ACTIVE';

-- USA and Europe are announced but not open for orders yet.
UPDATE "Region" SET "status" = 'COMING_SOON' WHERE "key" IN ('US', 'EU');
