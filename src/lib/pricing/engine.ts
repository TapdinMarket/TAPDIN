// Pure pricing engine. No imports on purpose: it runs on the server (source of truth),
// in the admin quote form (live preview only) and in unit tests.

export type CommissionBasis = 'PRODUCT' | 'PRODUCT_AND_DOMESTIC' | 'SUBTOTAL';

export interface QuoteInput {
  /** Price of one unit in the source currency. */
  unitPrice: number;
  quantity: number;
  /** Shipping inside the source country, in the source currency. */
  domesticShipping: number;
  /** 1 unit of source currency = `exchangeRate` AZN. */
  exchangeRate: number;
  internationalShippingAzn: number;
  commissionPercent: number;
  commissionBasis: CommissionBasis;
  minCommissionAzn: number;
  sourcingFeeAzn: number;
  customsChargesAzn: number;
  otherExpensesAzn: number;
}

export interface QuoteBreakdown {
  /** unitPrice × quantity in the source currency. */
  productCost: number;
  productCostAzn: number;
  domesticShippingAzn: number;
  internationalShippingAzn: number;
  /** Amount the commission percentage was applied to (AZN). */
  commissionBaseAzn: number;
  serviceFeeAzn: number;
  /** True when the minimum commission replaced the percentage result. */
  minCommissionApplied: boolean;
  sourcingFeeAzn: number;
  customsChargesAzn: number;
  otherExpensesAzn: number;
  totalAzn: number;
}

const toCents = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100);
const fromCents = (c: number) => c / 100;
const nonNeg = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export function calculateQuote(input: QuoteInput): QuoteBreakdown {
  const quantity = Math.max(1, Math.floor(nonNeg(input.quantity)) || 1);
  const rate = nonNeg(input.exchangeRate);

  const productCostCents = toCents(nonNeg(input.unitPrice)) * quantity;
  const productAzn = Math.round(productCostCents * rate);
  const domesticAzn = Math.round(toCents(nonNeg(input.domesticShipping)) * rate);
  const intlAzn = toCents(nonNeg(input.internationalShippingAzn));
  const sourcing = toCents(nonNeg(input.sourcingFeeAzn));
  const customs = toCents(nonNeg(input.customsChargesAzn));
  const other = toCents(nonNeg(input.otherExpensesAzn));

  let base = productAzn;
  if (input.commissionBasis === 'PRODUCT_AND_DOMESTIC') base = productAzn + domesticAzn;
  if (input.commissionBasis === 'SUBTOTAL') base = productAzn + domesticAzn + intlAzn;

  const percentFee = Math.round((base * nonNeg(input.commissionPercent)) / 100);
  const minFee = toCents(nonNeg(input.minCommissionAzn));
  const serviceFee = Math.max(percentFee, minFee);

  const total = productAzn + domesticAzn + intlAzn + serviceFee + sourcing + customs + other;

  return {
    productCost: fromCents(productCostCents),
    productCostAzn: fromCents(productAzn),
    domesticShippingAzn: fromCents(domesticAzn),
    internationalShippingAzn: fromCents(intlAzn),
    commissionBaseAzn: fromCents(base),
    serviceFeeAzn: fromCents(serviceFee),
    minCommissionApplied: minFee > percentFee,
    sourcingFeeAzn: fromCents(sourcing),
    customsChargesAzn: fromCents(customs),
    otherExpensesAzn: fromCents(other),
    totalAzn: fromCents(total),
  };
}

/** Suggested international cargo cost. Staff can always override the result. */
export function suggestCargoAzn(args: {
  weightKg: number;
  minBillableWeightKg: number;
  cargoPerKgUsd: number;
  usdRate: number;
}): number {
  const billable = Math.max(nonNeg(args.weightKg), nonNeg(args.minBillableWeightKg));
  return fromCents(Math.round(billable * toCents(nonNeg(args.cargoPerKgUsd)) * nonNeg(args.usdRate)));
}

// ── Multi-item orders ────────────────────────────────────────────
// One parcel, many items: every item is priced in its own currency, then the order pays international cargo
// and the service commission once. That is where combining items saves money (one minimum weight, one minimum fee).

export interface QuoteLineInput {
  unitPrice: number;
  quantity: number;
  domesticShipping: number;
  exchangeRate: number;
}

export interface OrderQuoteInput {
  lines: QuoteLineInput[];
  internationalShippingAzn: number;
  commissionPercent: number;
  commissionBasis: CommissionBasis;
  minCommissionAzn: number;
  sourcingFeeAzn: number;
  customsChargesAzn: number;
  otherExpensesAzn: number;
}

export interface OrderQuoteBreakdown extends Omit<QuoteBreakdown, 'productCost'> {
  lines: { productCost: number; productCostAzn: number; domesticShippingAzn: number }[];
}

export function calculateOrderQuote(input: OrderQuoteInput): OrderQuoteBreakdown {
  const lines = input.lines.map((l) => {
    const quantity = Math.max(1, Math.floor(nonNeg(l.quantity)) || 1);
    const rate = nonNeg(l.exchangeRate);
    const productCostCents = toCents(nonNeg(l.unitPrice)) * quantity;
    return {
      productCostCents,
      productAzn: Math.round(productCostCents * rate),
      domesticAzn: Math.round(toCents(nonNeg(l.domesticShipping)) * rate),
    };
  });
  const productAzn = lines.reduce((s, l) => s + l.productAzn, 0);
  const domesticAzn = lines.reduce((s, l) => s + l.domesticAzn, 0);
  const intlAzn = toCents(nonNeg(input.internationalShippingAzn));
  const sourcing = toCents(nonNeg(input.sourcingFeeAzn));
  const customs = toCents(nonNeg(input.customsChargesAzn));
  const other = toCents(nonNeg(input.otherExpensesAzn));

  let base = productAzn;
  if (input.commissionBasis === 'PRODUCT_AND_DOMESTIC') base = productAzn + domesticAzn;
  if (input.commissionBasis === 'SUBTOTAL') base = productAzn + domesticAzn + intlAzn;

  const percentFee = Math.round((base * nonNeg(input.commissionPercent)) / 100);
  const minFee = toCents(nonNeg(input.minCommissionAzn));
  const serviceFee = Math.max(percentFee, minFee);
  const total = productAzn + domesticAzn + intlAzn + serviceFee + sourcing + customs + other;

  return {
    lines: lines.map((l) => ({ productCost: fromCents(l.productCostCents), productCostAzn: fromCents(l.productAzn), domesticShippingAzn: fromCents(l.domesticAzn) })),
    productCostAzn: fromCents(productAzn),
    domesticShippingAzn: fromCents(domesticAzn),
    internationalShippingAzn: fromCents(intlAzn),
    commissionBaseAzn: fromCents(base),
    serviceFeeAzn: fromCents(serviceFee),
    minCommissionApplied: minFee > percentFee,
    sourcingFeeAzn: fromCents(sourcing),
    customsChargesAzn: fromCents(customs),
    otherExpensesAzn: fromCents(other),
    totalAzn: fromCents(total),
  };
}

/**
 * Customer-facing estimate for a basket, used to show what combining items saves: the same items shipped as one
 * order (one cargo minimum, one commission minimum) versus one order per item. Display only — never a quotation.
 */
export function estimateBasket(args: {
  items: { priceAzn: number; weightKg: number }[];
  commissionPercent: number;
  minCommissionAzn: number;
  minBillableWeightKg: number;
  cargoPerKgUsd: number;
  usdRate: number;
}) {
  const one = (priceAzn: number, weightKg: number) => {
    const cargo = suggestCargoAzn({ weightKg, minBillableWeightKg: args.minBillableWeightKg, cargoPerKgUsd: args.cargoPerKgUsd, usdRate: args.usdRate });
    const fee = Math.max(toCents(priceAzn) * nonNeg(args.commissionPercent) / 100, toCents(args.minCommissionAzn)) / 100;
    return fromCents(toCents(priceAzn) + toCents(cargo) + Math.round(fee * 100));
  };
  const items = args.items.filter((i) => i.priceAzn > 0);
  const together = one(items.reduce((s, i) => s + i.priceAzn, 0), items.reduce((s, i) => s + i.weightKg, 0));
  const separately = fromCents(items.reduce((s, i) => s + toCents(one(i.priceAzn, i.weightKg)), 0));
  return { together, separately, savings: fromCents(Math.max(0, toCents(separately) - toCents(together))) };
}
