-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('PERSONAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('PERSONAL', 'B2B');

-- CreateEnum
CREATE TYPE "SubmissionMethod" AS ENUM ('URL', 'IMAGE');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('CUSTOMER_REFERENCE', 'INSPECTION_PHOTO', 'INSPECTION_VIDEO');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "CommissionBasis" AS ENUM ('PRODUCT', 'PRODUCT_AND_DOMESTIC', 'SUBTOTAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CARD_TO_CARD', 'CASH', 'ONLINE');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('DUE', 'WAIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "accountType" "AccountType" NOT NULL DEFAULT 'PERSONAL',
    "locale" TEXT NOT NULL DEFAULT 'az',
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "taxId" TEXT,
    "commissionPercent" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultCurrency" TEXT NOT NULL,
    "commissionPercent" DECIMAL(5,2) NOT NULL,
    "minCommissionAzn" DECIMAL(10,2) NOT NULL,
    "cargoPerKgUsd" DECIMAL(10,2) NOT NULL,
    "minBillableWeightKg" DECIMAL(6,2) NOT NULL,
    "customsNote" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Marketplace" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regionKey" TEXT NOT NULL,
    "hostPatterns" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Marketplace_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "currency" TEXT NOT NULL,
    "rateToAzn" DECIMAL(12,6) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("currency")
);

-- CreateTable
CREATE TABLE "OrderStatus" (
    "key" TEXT NOT NULL,
    "labelAz" TEXT NOT NULL,
    "labelRu" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "showOnTimeline" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "OrderStatus_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "OrderType" NOT NULL DEFAULT 'PERSONAL',
    "method" "SubmissionMethod" NOT NULL,
    "sourceUrl" TEXT,
    "sourceMarketplace" TEXT,
    "regionKey" TEXT,
    "productTitle" TEXT,
    "productDescription" TEXT,
    "variant" TEXT,
    "sizeColor" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "instructions" TEXT,
    "statusKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderMedia" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "QuotationStatus" NOT NULL DEFAULT 'SENT',
    "currency" TEXT NOT NULL,
    "exchangeRate" DECIMAL(12,6) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "domesticShipping" DECIMAL(12,2) NOT NULL,
    "weightKg" DECIMAL(8,2),
    "commissionPercent" DECIMAL(5,2) NOT NULL,
    "commissionBasis" "CommissionBasis" NOT NULL,
    "minCommissionAzn" DECIMAL(10,2) NOT NULL,
    "productCost" DECIMAL(12,2) NOT NULL,
    "productCostAzn" DECIMAL(12,2) NOT NULL,
    "domesticShippingAzn" DECIMAL(12,2) NOT NULL,
    "internationalShippingAzn" DECIMAL(12,2) NOT NULL,
    "serviceFeeAzn" DECIMAL(12,2) NOT NULL,
    "sourcingFeeAzn" DECIMAL(12,2) NOT NULL,
    "customsChargesAzn" DECIMAL(12,2) NOT NULL,
    "otherExpensesAzn" DECIMAL(12,2) NOT NULL,
    "totalAzn" DECIMAL(12,2) NOT NULL,
    "noteToCustomer" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "quotationId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AZN',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdditionalCharge" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountAzn" DECIMAL(12,2) NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'DUE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdditionalCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tracking" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "trackingNumber" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" TEXT,
    "description" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalNote" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InternalNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessProfile_userId_key" ON "BusinessProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE INDEX "Order_statusKey_idx" ON "Order"("statusKey");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "OrderMedia_orderId_idx" ON "OrderMedia"("orderId");

-- CreateIndex
CREATE INDEX "Quotation_orderId_idx" ON "Quotation"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_orderId_version_key" ON "Quotation"("orderId", "version");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "AdditionalCharge_orderId_idx" ON "AdditionalCharge"("orderId");

-- CreateIndex
CREATE INDEX "Tracking_orderId_idx" ON "Tracking"("orderId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_idx" ON "OrderEvent"("orderId");

-- CreateIndex
CREATE INDEX "InternalNote_orderId_idx" ON "InternalNote"("orderId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marketplace" ADD CONSTRAINT "Marketplace_regionKey_fkey" FOREIGN KEY ("regionKey") REFERENCES "Region"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_statusKey_fkey" FOREIGN KEY ("statusKey") REFERENCES "OrderStatus"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderMedia" ADD CONSTRAINT "OrderMedia_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdditionalCharge" ADD CONSTRAINT "AdditionalCharge_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tracking" ADD CONSTRAINT "Tracking_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalNote" ADD CONSTRAINT "InternalNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
