// Serialisable quotation shape + the one place that turns it into display lines.
import type { Quotation } from '@prisma/client';
import type { BreakdownLine } from '@/components/breakdown';
import type { Messages } from '@/i18n/messages/en';
import { fmt, formatAzn, formatMoney } from './format';

export type QuoteView = {
  id: string;
  version: number;
  status: 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'SUPERSEDED';
  currency: string;
  exchangeRate: number;
  unitPrice: number;
  quantity: number;
  domesticShipping: number;
  weightKg: number | null;
  commissionPercent: number;
  commissionBasis: 'PRODUCT' | 'PRODUCT_AND_DOMESTIC' | 'SUBTOTAL';
  minCommissionAzn: number;
  productCostAzn: number;
  domesticShippingAzn: number;
  internationalShippingAzn: number;
  serviceFeeAzn: number;
  sourcingFeeAzn: number;
  customsChargesAzn: number;
  otherExpensesAzn: number;
  totalAzn: number;
  noteToCustomer: string | null;
  expiresAt: Date;
  createdAt: Date;
};

type Decimalish = { toString(): string } | number | null;
const n = (d: Decimalish) => (d == null ? 0 : Number(d));

export function toQuoteView(q: Quotation): QuoteView {
  return {
    id: q.id,
    version: q.version,
    status: q.status,
    currency: q.currency,
    exchangeRate: n(q.exchangeRate),
    unitPrice: n(q.unitPrice),
    quantity: q.quantity,
    domesticShipping: n(q.domesticShipping),
    weightKg: q.weightKg == null ? null : n(q.weightKg),
    commissionPercent: n(q.commissionPercent),
    commissionBasis: q.commissionBasis,
    minCommissionAzn: n(q.minCommissionAzn),
    productCostAzn: n(q.productCostAzn),
    domesticShippingAzn: n(q.domesticShippingAzn),
    internationalShippingAzn: n(q.internationalShippingAzn),
    serviceFeeAzn: n(q.serviceFeeAzn),
    sourcingFeeAzn: n(q.sourcingFeeAzn),
    customsChargesAzn: n(q.customsChargesAzn),
    otherExpensesAzn: n(q.otherExpensesAzn),
    totalAzn: n(q.totalAzn),
    noteToCustomer: q.noteToCustomer,
    expiresAt: q.expiresAt,
    createdAt: q.createdAt,
  };
}

export function quoteLines(q: QuoteView, m: Messages, locale: string): BreakdownLine[] {
  const minApplied = q.minCommissionAzn > 0 && q.serviceFeeAzn === q.minCommissionAzn;
  const lines: BreakdownLine[] = [
    {
      label: fmt(m.quote.product, { qty: q.quantity, price: formatMoney(q.unitPrice, q.currency, locale) }),
      value: formatAzn(q.productCostAzn, locale),
    },
    {
      label: m.quote.domestic,
      value: formatAzn(q.domesticShippingAzn, locale),
      hint: q.domesticShipping > 0 ? formatMoney(q.domesticShipping, q.currency, locale) : undefined,
    },
    {
      label: m.quote.international,
      value: formatAzn(q.internationalShippingAzn, locale),
      hint: q.weightKg ? `${q.weightKg} kg` : undefined,
    },
    {
      label: minApplied ? m.quote.serviceMin : fmt(m.quote.service, { pct: q.commissionPercent }),
      value: formatAzn(q.serviceFeeAzn, locale),
    },
  ];
  if (q.sourcingFeeAzn > 0) lines.push({ label: m.quote.sourcing, value: formatAzn(q.sourcingFeeAzn, locale) });
  lines.push({ label: m.quote.customs, value: formatAzn(q.customsChargesAzn, locale) });
  if (q.otherExpensesAzn > 0) lines.push({ label: m.quote.other, value: formatAzn(q.otherExpensesAzn, locale) });
  return lines;
}
