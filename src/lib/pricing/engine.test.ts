import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrderQuote, calculateQuote, estimateBasket, suggestCargoAzn, type QuoteInput } from './engine.ts';

const base: QuoteInput = {
  unitPrice: 30,
  quantity: 1,
  domesticShipping: 2,
  exchangeRate: 1.7,
  internationalShippingAzn: 8.5,
  commissionPercent: 15,
  commissionBasis: 'PRODUCT',
  minCommissionAzn: 0,
  sourcingFeeAzn: 0,
  customsChargesAzn: 0,
  otherExpensesAzn: 0,
};

test('spec example: $30 product, $2 domestic, $5 cargo, 15% on product value', () => {
  const q = calculateQuote(base);
  assert.equal(q.productCostAzn, 51);
  assert.equal(q.domesticShippingAzn, 3.4);
  assert.equal(q.serviceFeeAzn, 7.65);
  assert.equal(q.totalAzn, 70.55);
  assert.equal(q.minCommissionApplied, false);
});

test('minimum commission replaces a smaller percentage fee', () => {
  const q = calculateQuote({ ...base, minCommissionAzn: 10 });
  assert.equal(q.serviceFeeAzn, 10);
  assert.equal(q.minCommissionApplied, true);
  assert.equal(q.totalAzn, 72.9);
});

test('commission basis changes the base amount', () => {
  assert.equal(calculateQuote({ ...base, commissionBasis: 'PRODUCT_AND_DOMESTIC' }).serviceFeeAzn, 8.16);
  assert.equal(calculateQuote({ ...base, commissionBasis: 'SUBTOTAL' }).serviceFeeAzn, 9.44);
});

test('quantity multiplies unit price; extra fees are added', () => {
  const q = calculateQuote({ ...base, quantity: 3, sourcingFeeAzn: 10, customsChargesAzn: 4.25, otherExpensesAzn: 1 });
  assert.equal(q.productCost, 90);
  assert.equal(q.productCostAzn, 153);
  assert.equal(q.serviceFeeAzn, 22.95);
  assert.equal(q.totalAzn, 153 + 3.4 + 8.5 + 22.95 + 10 + 4.25 + 1);
});

test('negative and invalid numbers are treated as zero', () => {
  const q = calculateQuote({ ...base, domesticShipping: -5, customsChargesAzn: Number.NaN });
  assert.equal(q.domesticShippingAzn, 0);
  assert.equal(q.customsChargesAzn, 0);
});

test('no floating point drift on awkward values', () => {
  const q = calculateQuote({ ...base, unitPrice: 0.1, quantity: 3, exchangeRate: 1, domesticShipping: 0, internationalShippingAzn: 0, commissionPercent: 0 });
  assert.equal(q.totalAzn, 0.3);
});

test('cargo suggestion respects minimum billable weight', () => {
  assert.equal(suggestCargoAzn({ weightKg: 0.2, minBillableWeightKg: 0.5, cargoPerKgUsd: 6, usdRate: 1.7 }), 5.1);
  assert.equal(suggestCargoAzn({ weightKg: 2, minBillableWeightKg: 0.5, cargoPerKgUsd: 6, usdRate: 1.7 }), 20.4);
});

test('multi-item order: a single line gives exactly the single-item result', () => {
  const single = calculateQuote(base);
  const order = calculateOrderQuote({
    lines: [{ unitPrice: base.unitPrice, quantity: base.quantity, domesticShipping: base.domesticShipping, exchangeRate: base.exchangeRate }],
    internationalShippingAzn: base.internationalShippingAzn,
    commissionPercent: base.commissionPercent,
    commissionBasis: base.commissionBasis,
    minCommissionAzn: base.minCommissionAzn,
    sourcingFeeAzn: base.sourcingFeeAzn,
    customsChargesAzn: base.customsChargesAzn,
    otherExpensesAzn: base.otherExpensesAzn,
  });
  assert.equal(order.totalAzn, single.totalAzn);
  assert.equal(order.serviceFeeAzn, single.serviceFeeAzn);
  assert.equal(order.lines[0].productCostAzn, single.productCostAzn);
});

test('multi-item order: lines in different currencies, cargo and minimum commission charged once', () => {
  const q = calculateOrderQuote({
    lines: [
      { unitPrice: 100, quantity: 2, domesticShipping: 10, exchangeRate: 0.235 }, // 200 CNY + 10 CNY
      { unitPrice: 20, quantity: 1, domesticShipping: 0, exchangeRate: 1.7 }, // 20 USD
    ],
    internationalShippingAzn: 12,
    commissionPercent: 10,
    commissionBasis: 'PRODUCT',
    minCommissionAzn: 5,
    sourcingFeeAzn: 0,
    customsChargesAzn: 0,
    otherExpensesAzn: 0,
  });
  assert.deepEqual(q.lines.map((l) => l.productCostAzn), [47, 34]);
  assert.equal(q.productCostAzn, 81);
  assert.equal(q.domesticShippingAzn, 2.35);
  assert.equal(q.serviceFeeAzn, 8.1); // 10% of 81 — above the 5 AZN minimum, charged once
  assert.equal(q.totalAzn, 103.45); // 81 + 2.35 + 12 + 8.10
});

test('basket estimate: combining items is never more expensive and saves the per-order minimums', () => {
  const rules = { commissionPercent: 15, minCommissionAzn: 5, minBillableWeightKg: 0.5, cargoPerKgUsd: 6, usdRate: 1.7 };
  const two = estimateBasket({ ...rules, items: [{ priceAzn: 10, weightKg: 0.2 }, { priceAzn: 12, weightKg: 0.2 }] });
  // Separately: each pays 0.5 kg cargo (5.10) and the 5 AZN minimum fee. Together: one 0.5 kg minimum, one fee.
  assert.equal(two.separately, 42.2); // (10 + 5.10 + 5) + (12 + 5.10 + 5)
  assert.equal(two.together, 32.1); // 22 + 5.10 + 5
  assert.equal(two.savings, 10.1);
  const single = estimateBasket({ ...rules, items: [{ priceAzn: 50, weightKg: 1 }] });
  assert.equal(single.savings, 0);
});
