-- Multi-item orders: product fields move from "Order" to "OrderItem", per-item quotation prices to "QuotationLine".
-- Existing data is carried over first (every existing order becomes an order with one item); old columns are dropped last.

-- 1. New tables and columns
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "method" "SubmissionMethod" NOT NULL,
    "sourceUrl" TEXT,
    "sourceMarketplace" TEXT,
    "title" TEXT,
    "description" TEXT,
    "variant" TEXT,
    "sizeColor" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "clientPrice" DECIMAL(14,2),
    "clientCurrency" TEXT,
    "previewImageUrl" TEXT,
    "previewPrice" DECIMAL(14,2),
    "previewCurrency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuotationLine" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "exchangeRate" DECIMAL(12,6) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "domesticShipping" DECIMAL(12,2) NOT NULL,
    "productCost" DECIMAL(12,2) NOT NULL,
    "productCostAzn" DECIMAL(12,2) NOT NULL,
    "domesticShippingAzn" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "QuotationLine_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OrderMedia" ADD COLUMN "itemId" TEXT;

-- 2. Carry existing data over (one item per existing order; the item reuses the order id as its own id)
INSERT INTO "OrderItem" ("id", "orderId", "position", "method", "sourceUrl", "sourceMarketplace", "title", "description",
                         "variant", "sizeColor", "quantity", "clientPrice", "clientCurrency",
                         "previewImageUrl", "previewPrice", "previewCurrency", "createdAt")
SELECT "id" || '_i1', "id", 0, "method", "sourceUrl", "sourceMarketplace", "productTitle", "productDescription",
       "variant", "sizeColor", "quantity", "clientPrice", "clientCurrency",
       "previewImageUrl", "previewPrice", "previewCurrency", "createdAt"
FROM "Order";

INSERT INTO "QuotationLine" ("id", "quotationId", "itemId", "position", "currency", "exchangeRate", "unitPrice", "quantity",
                             "domesticShipping", "productCost", "productCostAzn", "domesticShippingAzn")
SELECT q."id" || '_l1', q."id", q."orderId" || '_i1', 0, q."currency", q."exchangeRate", q."unitPrice", q."quantity",
       q."domesticShipping", q."productCost", q."productCostAzn", q."domesticShippingAzn"
FROM "Quotation" q;

UPDATE "OrderMedia" SET "itemId" = "orderId" || '_i1' WHERE "kind" = 'CUSTOMER_REFERENCE';

-- 3. Indexes and foreign keys
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_sourceMarketplace_idx" ON "OrderItem"("sourceMarketplace");
CREATE INDEX "QuotationLine_quotationId_idx" ON "QuotationLine"("quotationId");
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderMedia" ADD CONSTRAINT "OrderMedia_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Drop the old single-product columns
ALTER TABLE "Order" DROP COLUMN "clientCurrency",
DROP COLUMN "clientPrice",
DROP COLUMN "method",
DROP COLUMN "previewCurrency",
DROP COLUMN "previewFetchedAt",
DROP COLUMN "previewImageUrl",
DROP COLUMN "previewPrice",
DROP COLUMN "productDescription",
DROP COLUMN "productTitle",
DROP COLUMN "quantity",
DROP COLUMN "sizeColor",
DROP COLUMN "sourceMarketplace",
DROP COLUMN "sourceUrl",
DROP COLUMN "variant";

ALTER TABLE "Quotation" DROP COLUMN "currency",
DROP COLUMN "domesticShipping",
DROP COLUMN "exchangeRate",
DROP COLUMN "productCost",
DROP COLUMN "quantity",
DROP COLUMN "unitPrice";
