'use client';
import { useActionState, useState } from 'react';
import { Calculator } from 'lucide-react';
import { useI18n } from '@/i18n/client';
import { fmt, formatAzn, formatMoney } from '@/lib/format';
import { calculateOrderQuote, suggestCargoAzn, type CommissionBasis } from '@/lib/pricing/engine';
import type { ActionState, FormAction } from './action-form';
import { SubmitButton } from './action-form';
import { Breakdown } from './breakdown';
import { Button, Field, Input, Select, Textarea } from './ui';

export type QuoteFormItem = {
  id: string;
  label: string;
  quantity: number;
  /** What the customer said the store asks, shown as a hint — never filled in automatically. */
  clientPrice: number | null;
  clientCurrency: string | null;
};

type Props = {
  action: FormAction;
  orderId: string;
  items: QuoteFormItem[];
  rates: Record<string, number>;
  /** Source and age of each configured rate (AZN has none). */
  rateInfo: Record<string, { source: string; updatedAt: string }>;
  cargo: { perKgUsd: number; minWeightKg: number } | null;
  customsNote: string;
  defaults: {
    currency: string;
    commissionPercent: number;
    commissionBasis: CommissionBasis;
    minCommissionAzn: number;
    validDays: number;
  };
};

const num = (v: string) => {
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

type LineState = { currency: string; exchangeRate: string; unitPrice: string; quantity: string; domesticShipping: string };

/**
 * Staff quotation form for a whole order: one price line per item, then cargo and commission once for the parcel.
 * The preview uses the same pricing engine as the server, but the server recomputes every amount on submit.
 */
export function QuoteForm({ action, orderId, items, rates, rateInfo, cargo, customsNote, defaults }: Props) {
  const { m, locale } = useI18n();
  const t = m.admin.quote;
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);

  const [lines, setLines] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(
      items.map((i) => [i.id, { currency: defaults.currency, exchangeRate: String(rates[defaults.currency] ?? ''), unitPrice: '', quantity: String(i.quantity), domesticShipping: '0' }]),
    ),
  );
  const [v, setV] = useState({
    weightKg: '',
    internationalShippingAzn: '0',
    commissionPercent: String(defaults.commissionPercent),
    commissionBasis: defaults.commissionBasis,
    minCommissionAzn: String(defaults.minCommissionAzn),
    sourcingFeeAzn: '0',
    customsChargesAzn: '0',
    otherExpensesAzn: '0',
    validDays: String(defaults.validDays),
  });
  const set = (key: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((p) => ({ ...p, [key]: e.target.value }));
  const setLine = (id: string, patch: Partial<LineState>) => setLines((p) => ({ ...p, [id]: { ...p[id], ...patch } }));

  const b = calculateOrderQuote({
    lines: items.map((i) => ({
      unitPrice: num(lines[i.id].unitPrice),
      quantity: num(lines[i.id].quantity),
      domesticShipping: num(lines[i.id].domesticShipping),
      exchangeRate: num(lines[i.id].exchangeRate),
    })),
    internationalShippingAzn: num(v.internationalShippingAzn),
    commissionPercent: num(v.commissionPercent),
    commissionBasis: v.commissionBasis,
    minCommissionAzn: num(v.minCommissionAzn),
    sourcingFeeAzn: num(v.sourcingFeeAzn),
    customsChargesAzn: num(v.customsChargesAzn),
    otherExpensesAzn: num(v.otherExpensesAzn),
  });

  const numeric = { type: 'number', step: '0.01', min: '0', inputMode: 'decimal' } as const;

  return (
    <form action={formAction} className="grid gap-6 xl:grid-cols-[1fr_18rem]">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="space-y-5">
        {/* ── one price line per item ── */}
        <ol className="space-y-3">
          {items.map((item, index) => {
            const l = lines[item.id];
            return (
              <li key={item.id} className="rounded-control border border-line p-4">
                <p className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">
                    <span className="tabular mr-2 text-muted">{index + 1}.</span>
                    {item.label}
                  </span>
                  {item.clientPrice !== null && item.clientCurrency && (
                    <span className="text-[12px] text-muted">
                      {m.detail.clientPriceStaff}: {formatMoney(item.clientPrice, item.clientCurrency, locale)}
                    </span>
                  )}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <Field label={t.currency}>
                    <Select
                      name={`currency__${item.id}`}
                      value={l.currency}
                      onChange={(e) => setLine(item.id, { currency: e.target.value, exchangeRate: String(rates[e.target.value] ?? l.exchangeRate) })}
                    >
                      {Object.keys(rates).map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t.exchangeRate}>
                    <Input name={`exchangeRate__${item.id}`} {...numeric} step="0.000001" value={l.exchangeRate} onChange={(e) => setLine(item.id, { exchangeRate: e.target.value })} required />
                    <RateNote info={rateInfo[l.currency]} rate={rates[l.currency]} />
                  </Field>
                  <Field label={`${t.unitPrice}, ${l.currency}`}>
                    <Input name={`unitPrice__${item.id}`} {...numeric} value={l.unitPrice} onChange={(e) => setLine(item.id, { unitPrice: e.target.value })} required />
                  </Field>
                  <Field label={t.quantity}>
                    <Input name={`quantity__${item.id}`} type="number" min="1" step="1" inputMode="numeric" value={l.quantity} onChange={(e) => setLine(item.id, { quantity: e.target.value })} required />
                  </Field>
                  <Field label={`${t.domestic}, ${l.currency}`} className="col-span-2 sm:col-span-1">
                    <Input name={`domesticShipping__${item.id}`} {...numeric} value={l.domesticShipping} onChange={(e) => setLine(item.id, { domesticShipping: e.target.value })} />
                  </Field>
                </div>
              </li>
            );
          })}
        </ol>

        {/* ── the parcel: cargo and commission once ── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label={t.weight}>
            <Input name="weightKg" {...numeric} value={v.weightKg} onChange={set('weightKg')} />
          </Field>
          <Field label={t.international} className="col-span-2 sm:col-span-1">
            <Input name="internationalShippingAzn" {...numeric} value={v.internationalShippingAzn} onChange={set('internationalShippingAzn')} />
          </Field>
        </div>
        {cargo && rates.USD ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={num(v.weightKg) <= 0}
            onClick={() =>
              setV((p) => ({
                ...p,
                internationalShippingAzn: suggestCargoAzn({ weightKg: num(p.weightKg), minBillableWeightKg: cargo.minWeightKg, cargoPerKgUsd: cargo.perKgUsd, usdRate: rates.USD }).toFixed(2),
              }))
            }
          >
            <Calculator className="size-4" aria-hidden />
            {t.suggest} ({cargo.perKgUsd} USD/kg)
          </Button>
        ) : (
          <p className="text-[13px] text-muted">{t.regionFirst}</p>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label={t.commissionPercent}>
            <Input name="commissionPercent" {...numeric} max="100" value={v.commissionPercent} onChange={set('commissionPercent')} />
          </Field>
          <Field label={t.minCommission}>
            <Input name="minCommissionAzn" {...numeric} value={v.minCommissionAzn} onChange={set('minCommissionAzn')} />
          </Field>
          <Field label={t.basis} className="col-span-2 sm:col-span-1">
            <Select name="commissionBasis" value={v.commissionBasis} onChange={set('commissionBasis')}>
              {(['PRODUCT', 'PRODUCT_AND_DOMESTIC', 'SUBTOTAL'] as const).map((k) => (
                <option key={k} value={k}>{t.basisOptions[k]}</option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label={t.sourcing}>
            <Input name="sourcingFeeAzn" {...numeric} value={v.sourcingFeeAzn} onChange={set('sourcingFeeAzn')} />
          </Field>
          <Field label={t.customs}>
            <Input name="customsChargesAzn" {...numeric} value={v.customsChargesAzn} onChange={set('customsChargesAzn')} />
          </Field>
          <Field label={t.other}>
            <Input name="otherExpensesAzn" {...numeric} value={v.otherExpensesAzn} onChange={set('otherExpensesAzn')} />
          </Field>
          <Field label={t.validDays}>
            <Input name="validDays" type="number" min="1" max="60" step="1" value={v.validDays} onChange={set('validDays')} required />
          </Field>
        </div>
        {customsNote && (
          <p className="rounded-control bg-warn-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-warn">
            <span className="font-medium">{t.customsRef}: </span>
            {customsNote}
          </p>
        )}

        <Field label={t.note} optional={m.common.optional}>
          <Textarea name="noteToCustomer" maxLength={1000} rows={2} />
        </Field>
      </div>

      <div className="h-fit rounded-control bg-paper p-4 xl:sticky xl:top-6">
        <p className="mb-2 text-[13px] font-medium">{t.preview}</p>
        <Breakdown
          lines={[
            ...items.map((item, i) => ({ label: items.length > 1 ? `${i + 1}. ${item.label}` : m.pricingPage.lines.product, value: formatAzn(b.lines[i].productCostAzn, locale) })),
            { label: m.quote.domestic, value: formatAzn(b.domesticShippingAzn, locale) },
            { label: m.quote.international, value: formatAzn(b.internationalShippingAzn, locale) },
            { label: b.minCommissionApplied ? m.quote.serviceMin : fmt(m.quote.service, { pct: num(v.commissionPercent) }), value: formatAzn(b.serviceFeeAzn, locale) },
            { label: m.quote.sourcing, value: formatAzn(b.sourcingFeeAzn, locale) },
            { label: m.quote.customs, value: formatAzn(b.customsChargesAzn, locale) },
            { label: m.quote.other, value: formatAzn(b.otherExpensesAzn, locale) },
          ]}
          total={{ label: m.quote.total, value: formatAzn(b.totalAzn, locale) }}
        />
        <p className="mt-3 text-[12px] text-muted">{t.previewHint}</p>
        <SubmitButton variant="accent" className="mt-4 w-full">{t.send}</SubmitButton>
        {state?.message && <p className={`mt-3 text-[13px] ${state.ok ? 'text-accent' : 'text-danger'}`}>{state.message}</p>}
      </div>
    </form>
  );
}

/** Under the rate field: official (CBAR) or manual, when, and a warning if it is older than two days. */
function RateNote({ info, rate }: { info?: { source: string; updatedAt: string }; rate?: number }) {
  const { m } = useI18n();
  const t = m.admin.quote;
  if (!info || rate === undefined) return null;
  const days = Math.floor((Date.now() - new Date(info.updatedAt).getTime()) / 86_400_000);
  // DD.MM.YYYY: identical in every browser (Azerbaijani date names are missing in some).
  const d = new Date(info.updatedAt);
  const date = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  const text = fmt(info.source === 'CBAR' ? t.rateAuto : t.rateManual, { rate: String(rate), date });
  return (
    <span className={`mt-1 block text-[11px] leading-snug ${days >= 2 ? 'text-warn' : 'text-muted'}`}>
      {days >= 2 ? fmt(t.rateStale, { days }) : text}
    </span>
  );
}
