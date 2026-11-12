import 'server-only';
import type { BreakdownLine } from '@/components/breakdown';
import type { Messages } from '@/i18n/messages/en';
import { fmt, formatAzn, formatMoney } from './format';
import { calculateQuote, suggestCargoAzn } from './pricing/engine';
import { getCatalog, getSettings } from './settings';

/**
 * Illustrative quotation built from the *currently configured* rates of the first enabled region.
 * Always labelled as an example in the UI.
 */
export async function getExampleQuote(m: Messages, locale: string) {
  const [{ regions, rates }, { general }] = await Promise.all([getCatalog(), getSettings()]);
  const region = regions.find((r) => r.enabled);
  const rate = rates.find((r) => r.currency === region?.defaultCurrency)?.rateToAzn;
  const usd = rates.find((r) => r.currency === 'USD')?.rateToAzn;
  if (!region || !rate || !usd) return null;

  // A product worth roughly 60 AZN, 1.2 kg.
  const unitPrice = Math.max(1, Math.round(60 / rate));
  const domestic = Math.max(1, Math.round(3 / rate));
  const weightKg = 1.2;
  const b = calculateQuote({
    unitPrice,
    quantity: 1,
    domesticShipping: domestic,
    exchangeRate: rate,
    internationalShippingAzn: suggestCargoAzn({ weightKg, minBillableWeightKg: region.minBillableWeightKg, cargoPerKgUsd: region.cargoPerKgUsd, usdRate: usd }),
    commissionPercent: region.commissionPercent,
    commissionBasis: general.commissionBasis,
    minCommissionAzn: region.minCommissionAzn,
    sourcingFeeAzn: 0,
    customsChargesAzn: 0,
    otherExpensesAzn: 0,
  });

  const lines: BreakdownLine[] = [
    { label: m.pricingPage.lines.product, value: formatAzn(b.productCostAzn, locale), hint: formatMoney(unitPrice, region.defaultCurrency, locale) },
    { label: m.pricingPage.lines.domestic, value: formatAzn(b.domesticShippingAzn, locale), hint: formatMoney(domestic, region.defaultCurrency, locale) },
    { label: m.pricingPage.lines.international, value: formatAzn(b.internationalShippingAzn, locale), hint: `${weightKg} kg` },
    {
      label: b.minCommissionApplied ? m.quote.serviceMin : fmt(m.quote.service, { pct: region.commissionPercent }),
      value: formatAzn(b.serviceFeeAzn, locale),
    },
    { label: m.quote.customs, value: formatAzn(0, locale) },
  ];

  return { region, lines, total: { label: m.pricingPage.lines.total, value: formatAzn(b.totalAzn, locale) } };
}
