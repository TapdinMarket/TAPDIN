// Serialisable quotation shape + the one place that turns it into display lines.
import type { Quotation, QuotationLine } from '@prisma/client';
import type { BreakdownLine } from '@/components/breakdown';
import type { Messages } from '@/i18n/messages/en';
import { fmt, formatAzn, formatMoney } from './format';

export type QuoteLineView = {
  itemId: string;
  currency: string;
  exchangeRate: number;
  unitPrice: number;
  quantity: number;
  domesticShipping: number;
  productCostAzn: number;
  domesticShippingAzn: number;
};

export type QuoteView = {
  id: string;
  version: number;
  status: 'SENT' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'SUPERSEDED';
  lines: QuoteLineView[];
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
  insuranceAzn: number;
  insured: boolean;
  noteToCustomer: string | null;
  expiresAt: Date;
  createdAt: Date;
};

type Decimalish = { toString(): string } | number | null;
const n = (d: Decimalish) => (d == null ? 0 : Number(d));

export function toQuoteView(q: Quotation & { lines: QuotationLine[] }): QuoteView {
  return {
    id: q.id,
    version: q.version,
    status: q.status,
    lines: [...q.lines]
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        itemId: l.itemId,
        currency: l.currency,
        exchangeRate: n(l.exchangeRate),
        unitPrice: n(l.unitPrice),
        quantity: l.quantity,
        domesticShipping: n(l.domesticShipping),
        productCostAzn: n(l.productCostAzn),
        domesticShippingAzn: n(l.domesticShippingAzn),
      })),
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
    insuranceAzn: n(q.insuranceAzn),
    insured: q.insured,
    noteToCustomer: q.noteToCustomer,
    expiresAt: q.expiresAt,
    createdAt: q.createdAt,
  };
}

/** Display rows: one per item, then the order-level charges (cargo and commission are paid once per order). */
export function quoteLines(q: QuoteView, m: Messages, locale: string, itemName: (itemId: string, index: number) => string): BreakdownLine[] {
  const minApplied = q.minCommissionAzn > 0 && q.serviceFeeAzn === q.minCommissionAzn;
  const domesticHint = q.lines
    .filter((l) => l.domesticShipping > 0)
    .map((l) => formatMoney(l.domesticShipping, l.currency, locale))
    .join(' + ');
  const lines: BreakdownLine[] = q.lines.map((l, i) => ({
    label: q.lines.length > 1 ? itemName(l.itemId, i) : fmt(m.quote.product, { qty: l.quantity, price: formatMoney(l.unitPrice, l.currency, locale) }),
    value: formatAzn(l.productCostAzn, locale),
    hint: q.lines.length > 1 ? `${l.quantity} × ${formatMoney(l.unitPrice, l.currency, locale)}` : undefined,
  }));
  lines.push(
    { label: m.quote.domestic, value: formatAzn(q.domesticShippingAzn, locale), hint: domesticHint || undefined },
    { label: m.quote.international, value: formatAzn(q.internationalShippingAzn, locale), hint: q.weightKg ? `${q.weightKg} kg` : undefined },
    { label: minApplied ? m.quote.serviceMin : fmt(m.quote.service, { pct: q.commissionPercent }), value: formatAzn(q.serviceFeeAzn, locale) },
  );
  if (q.sourcingFeeAzn > 0) lines.push({ label: m.quote.sourcing, value: formatAzn(q.sourcingFeeAzn, locale) });
  lines.push({ label: m.quote.customs, value: formatAzn(q.customsChargesAzn, locale) });
  if (q.otherExpensesAzn > 0) lines.push({ label: m.quote.other, value: formatAzn(q.otherExpensesAzn, locale) });
  return lines;
}

/** Short name of an item for lists: its title, else the start of its description. */
export function itemLabel(item: { title: string | null; description: string | null }, fallback: string) {
  const text = item.title ?? item.description ?? '';
  return text ? (text.length > 70 ? `${text.slice(0, 68)}…` : text) : fallback;
}

type ItemSummary = { title: string | null; description: string | null; method: string; sourceMarketplace: string | null; quantity: number };

/** One line for order lists: first item's name, plus how many more items the parcel holds. */
export function orderSummary(items: ItemSummary[], photoRequest: string) {
  const first = items[0] ? itemLabel(items[0], photoRequest) : photoRequest;
  return items.length > 1 ? `${first} +${items.length - 1}` : first;
}

/** Distinct store names of an order, e.g. "Taobao, 1688". */
export function orderStores(items: ItemSummary[], marketplaces: { key: string; name: string }[], photoRequest: string, unknown: string) {
  const names = items.map((i) => marketplaces.find((x) => x.key === i.sourceMarketplace)?.name ?? (i.method === 'IMAGE' ? photoRequest : unknown));
  return [...new Set(names)].join(', ');
}
