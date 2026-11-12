'use client';
import { useActionState, useState } from 'react';
import { Calculator } from 'lucide-react';
import { useI18n } from '@/i18n/client';
import { fmt, formatAzn } from '@/lib/format';
import { calculateQuote, suggestCargoAzn, type CommissionBasis } from '@/lib/pricing/engine';
import type { ActionState, FormAction } from './action-form';
import { SubmitButton } from './action-form';
import { Breakdown } from './breakdown';
import { Button, Field, Input, Select, Textarea } from './ui';

type Props = {
  action: FormAction;
  orderId: string;
  rates: Record<string, number>;
  cargo: { perKgUsd: number; minWeightKg: number } | null;
  customsNote: string;
  defaults: {
    currency: string;
    quantity: number;
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

/**
 * Staff quotation form. The preview uses the same pricing engine as the server,
 * but it is only a preview: the server recomputes every amount from the submitted inputs.
 */
export function QuoteForm({ action, orderId, rates, cargo, customsNote, defaults }: Props) {
  const { m, locale } = useI18n();
  const t = m.admin.quote;
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);

  const [v, setV] = useState({
    currency: defaults.currency,
    exchangeRate: String(rates[defaults.currency] ?? ''),
    unitPrice: '',
    quantity: String(defaults.quantity),
    domesticShipping: '0',
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

  const b = calculateQuote({
    unitPrice: num(v.unitPrice),
    quantity: num(v.quantity),
    domesticShipping: num(v.domesticShipping),
    exchangeRate: num(v.exchangeRate),
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
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label={t.currency}>
            <Select
              name="currency"
              value={v.currency}
              onChange={(e) => setV((p) => ({ ...p, currency: e.target.value, exchangeRate: String(rates[e.target.value] ?? p.exchangeRate) }))}
            >
              {Object.keys(rates).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label={t.exchangeRate}>
            <Input name="exchangeRate" {...numeric} step="0.000001" value={v.exchangeRate} onChange={set('exchangeRate')} required />
          </Field>
          <Field label={`${t.unitPrice}, ${v.currency}`}>
            <Input name="unitPrice" {...numeric} value={v.unitPrice} onChange={set('unitPrice')} required />
          </Field>
          <Field label={t.quantity}>
            <Input name="quantity" type="number" min="1" step="1" inputMode="numeric" value={v.quantity} onChange={set('quantity')} required />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field label={`${t.domestic}, ${v.currency}`}>
            <Input name="domesticShipping" {...numeric} value={v.domesticShipping} onChange={set('domesticShipping')} />
          </Field>
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
            { label: m.pricingPage.lines.product, value: formatAzn(b.productCostAzn, locale) },
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
