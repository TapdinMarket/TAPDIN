import type { ReactNode } from 'react';
import {
  deleteRateAction,
  saveContactAction,
  saveCustomsTextAction,
  saveGeneralAction,
  saveMarketplaceAction,
  savePaymentTextAction,
  saveRateAction,
  saveRegionAction,
  saveStatusAction,
} from '@/app/actions/admin';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Badge, Card, CardHeader, Field, Input, Select, Textarea } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { requireStaff } from '@/lib/auth';
import { db } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { getCatalog, getSettings } from '@/lib/settings';

function Check({ name, label, defaultChecked, disabled }: { name: string; label: string; defaultChecked?: boolean; disabled?: boolean }) {
  return (
    <label className="flex h-11 items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} disabled={disabled} className="size-4 accent-[var(--color-accent)]" />
      {label}
    </label>
  );
}

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-6">
      <CardHeader title={title} hint={hint} />
      <div className="p-5 sm:p-6">{children}</div>
    </Card>
  );
}

export default async function AdminSettingsPage() {
  const user = await requireStaff();
  const [{ m, locale }, settings, catalog, statuses] = await Promise.all([
    getI18n(),
    getSettings(),
    getCatalog(),
    db.orderStatus.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);
  const t = m.admin.settings;
  const q = m.admin.quote;
  const isAdmin = user.role === 'ADMIN';
  const currencies = catalog.rates.map((r) => r.currency);

  const nav = [
    ['general', t.general],
    ['rates', t.rates],
    ['regions', t.regions],
    ['marketplaces', t.marketplaces],
    ['statuses', t.statuses],
    ['contact', t.contact],
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t.title}</h1>
      {!isAdmin && <p className="mt-4 rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">{t.adminOnly}</p>}
      <nav className="mt-5 flex flex-wrap gap-2 text-sm" aria-label={t.title}>
        {nav.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-line-strong bg-surface px-3.5 py-1.5 hover:border-ink/40">{label}</a>
        ))}
      </nav>

      <fieldset disabled={!isAdmin} className="mt-6 space-y-6 disabled:opacity-70">
        {/* ── General ── */}
        <Section id="general" title={t.general}>
          <ActionForm action={saveGeneralAction} className="grid gap-4 sm:grid-cols-3 sm:items-end">
            <Field label={t.validity}>
              <Input name="quoteValidityDays" type="number" min="1" max="60" defaultValue={settings.general.quoteValidityDays} required />
            </Field>
            <Field label={t.basis}>
              <Select name="commissionBasis" defaultValue={settings.general.commissionBasis}>
                {(['PRODUCT', 'PRODUCT_AND_DOMESTIC', 'SUBTOTAL'] as const).map((k) => <option key={k} value={k}>{q.basisOptions[k]}</option>)}
              </Select>
            </Field>
            <Field label={t.sourcingFee}>
              <Input name="sourcingFeeAzn" type="number" step="0.01" min="0" defaultValue={settings.general.sourcingFeeAzn} required />
            </Field>
            <div className="sm:col-span-3"><SubmitButton size="sm">{m.common.save}</SubmitButton></div>
          </ActionForm>
        </Section>

        {/* ── Exchange rates ── */}
        <Section id="rates" title={t.rates} hint={t.ratesHint}>
          <ul className="divide-y divide-line">
            {catalog.rates.map((r) => (
              <li key={r.currency} className="flex flex-wrap items-start gap-3 py-3 first:pt-0">
                <span className="tabular flex h-11 w-14 items-center font-medium">{r.currency}</span>
                <ActionForm action={saveRateAction} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="currency" value={r.currency} />
                  <Input name="rateToAzn" type="number" step="0.000001" min="0.000001" defaultValue={r.rateToAzn} className="w-36" aria-label={`${r.currency} ${t.rate}`} required />
                  <SubmitButton size="sm" variant="secondary">{m.common.save}</SubmitButton>
                  <span className="tabular text-[12px] text-muted">{t.updated}: {formatDate(r.updatedAt, locale, true)}</span>
                </ActionForm>
                <ActionForm action={deleteRateAction} className="ml-auto">
                  <input type="hidden" name="currency" value={r.currency} />
                  <SubmitButton size="sm" variant="ghost">{m.common.remove}</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
          <ActionForm action={saveRateAction} resetOnSuccess className="mt-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
            <Field label={t.currency}><Input name="currency" placeholder="GBP" maxLength={3} className="w-24 uppercase" required /></Field>
            <Field label={t.rate}><Input name="rateToAzn" type="number" step="0.000001" min="0.000001" className="w-36" required /></Field>
            <SubmitButton size="sm" className="mb-1">{m.common.add}</SubmitButton>
          </ActionForm>
        </Section>

        {/* ── Regions ── */}
        <Section id="regions" title={t.regions} hint={t.regionsHint}>
          <div className="space-y-5">
            {[...catalog.regions, null].map((r) => (
              <details key={r?.key ?? 'new'} open={!!r} className="rounded-control border border-line">
                <summary className="flex items-center justify-between px-4 py-3 text-sm font-medium">
                  <span>{r ? `${r.name} · ${r.key}` : `+ ${t.newRegion}`}</span>
                  {r && !r.enabled && <Badge>off</Badge>}
                </summary>
                <ActionForm action={saveRegionAction} resetOnSuccess={!r} className="grid grid-cols-2 gap-4 border-t border-line p-4 sm:grid-cols-4 sm:items-end">
                  {r ? <input type="hidden" name="key" value={r.key} /> : (
                    <>
                      <input type="hidden" name="isNew" value="1" />
                      <Field label={t.key}><Input name="key" placeholder="TR" maxLength={10} className="uppercase" required /></Field>
                    </>
                  )}
                  <Field label={t.regionName}><Input name="name" defaultValue={r?.name} maxLength={60} required /></Field>
                  <Field label={t.defaultCurrency}>
                    <Select name="defaultCurrency" defaultValue={r?.defaultCurrency ?? 'USD'}>
                      {currencies.map((c) => <option key={c}>{c}</option>)}
                    </Select>
                  </Field>
                  <Field label={t.commission}><Input name="commissionPercent" type="number" step="0.01" min="0" max="100" defaultValue={r?.commissionPercent ?? 15} required /></Field>
                  <Field label={t.minCommission}><Input name="minCommissionAzn" type="number" step="0.01" min="0" defaultValue={r?.minCommissionAzn ?? 5} required /></Field>
                  <Field label={t.cargoPerKg}><Input name="cargoPerKgUsd" type="number" step="0.01" min="0" defaultValue={r?.cargoPerKgUsd ?? 8} required /></Field>
                  <Field label={t.minWeight}><Input name="minBillableWeightKg" type="number" step="0.01" min="0" defaultValue={r?.minBillableWeightKg ?? 0.5} required /></Field>
                  <Check name="enabled" label={t.enabled} defaultChecked={r?.enabled ?? true} />
                  <Field label={t.customsNote} className="col-span-2 sm:col-span-4">
                    <Textarea name="customsNote" defaultValue={r?.customsNote} rows={2} maxLength={1000} />
                  </Field>
                  <div className="col-span-2 sm:col-span-4"><SubmitButton size="sm" variant={r ? 'secondary' : 'primary'}>{r ? m.common.save : m.common.add}</SubmitButton></div>
                </ActionForm>
              </details>
            ))}
          </div>
        </Section>

        {/* ── Marketplaces ── */}
        <Section id="marketplaces" title={t.marketplaces} hint={t.marketplacesHint}>
          <div className="space-y-4">
            {[...catalog.marketplaces, null].map((x) => (
              <ActionForm key={x?.key ?? 'new'} action={saveMarketplaceAction} resetOnSuccess={!x} className={`grid grid-cols-2 gap-3 sm:grid-cols-[7rem_1fr_8rem_1.6fr_auto_auto] sm:items-end ${x ? '' : 'border-t border-line pt-4'}`}>
                {x ? (
                  <>
                    <input type="hidden" name="key" value={x.key} />
                    <span className="tabular flex h-11 items-center text-sm text-muted">{x.key}</span>
                  </>
                ) : (
                  <>
                    <input type="hidden" name="isNew" value="1" />
                    <Field label={t.key}><Input name="key" placeholder="etsy" maxLength={30} required /></Field>
                  </>
                )}
                <Field label={x ? '' : t.regionName}><Input name="name" defaultValue={x?.name} aria-label={t.regionName} maxLength={60} required /></Field>
                <Field label={x ? '' : m.admin.order.region}>
                  <Select name="regionKey" defaultValue={x?.regionKey} aria-label={m.admin.order.region}>
                    {catalog.regions.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                  </Select>
                </Field>
                <Field label={x ? '' : t.hosts}><Input name="hostPatterns" defaultValue={x?.hostPatterns.join(', ')} placeholder="example.com, example.cn" aria-label={t.hosts} maxLength={500} /></Field>
                <Check name="enabled" label={t.enabled} defaultChecked={x?.enabled ?? true} />
                <SubmitButton size="sm" variant={x ? 'secondary' : 'primary'} className="mb-1">{x ? m.common.save : m.common.add}</SubmitButton>
              </ActionForm>
            ))}
          </div>
        </Section>

        {/* ── Statuses ── */}
        <Section id="statuses" title={t.statuses} hint={t.statusesHint}>
          <div className="space-y-3">
            {[...statuses, null].map((s) => (
              <details key={s?.key ?? 'new'} className="rounded-control border border-line">
                <summary className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="font-medium">
                    {s ? (
                      <>
                        <span className="tabular mr-3 text-muted">{s.sortOrder}</span>
                        {locale === 'ru' ? s.labelRu : locale === 'en' ? s.labelEn : s.labelAz}
                      </>
                    ) : `+ ${t.newStatus}`}
                  </span>
                  <span className="flex gap-2">
                    {s?.isSystem && <Badge>{t.system}</Badge>}
                    {s && !s.active && <Badge tone="warn">off</Badge>}
                  </span>
                </summary>
                <ActionForm action={saveStatusAction} resetOnSuccess={!s} className="grid grid-cols-2 gap-4 border-t border-line p-4 sm:grid-cols-4 sm:items-end">
                  {s ? <input type="hidden" name="key" value={s.key} /> : (
                    <>
                      <input type="hidden" name="isNew" value="1" />
                      <Field label={t.key}><Input name="key" placeholder="repacking" maxLength={30} required /></Field>
                    </>
                  )}
                  <Field label={t.labelAz}><Input name="labelAz" defaultValue={s?.labelAz} maxLength={80} required /></Field>
                  <Field label={t.labelRu}><Input name="labelRu" defaultValue={s?.labelRu} maxLength={80} required /></Field>
                  <Field label={t.labelEn}><Input name="labelEn" defaultValue={s?.labelEn} maxLength={80} required /></Field>
                  <Field label={t.sort}><Input name="sortOrder" type="number" min="0" step="1" defaultValue={s?.sortOrder ?? 125} required /></Field>
                  {s?.isSystem ? <input type="hidden" name="active" value="on" /> : <Check name="active" label={t.active} defaultChecked={s?.active ?? true} />}
                  <Check name="showOnTimeline" label={t.timeline} defaultChecked={s?.showOnTimeline ?? true} />
                  <div className="col-span-2 sm:col-span-4"><SubmitButton size="sm" variant={s ? 'secondary' : 'primary'}>{s ? m.common.save : m.common.add}</SubmitButton></div>
                </ActionForm>
              </details>
            ))}
          </div>
        </Section>

        {/* ── Contact & texts ── */}
        <Section id="contact" title={t.contact}>
          <ActionForm action={saveContactAction} className="grid gap-4 sm:grid-cols-2">
            <Field label={t.phone}><Input name="phone" defaultValue={settings.contact.phone} maxLength={40} /></Field>
            <Field label={t.whatsapp}><Input name="whatsapp" defaultValue={settings.contact.whatsapp} maxLength={40} inputMode="numeric" /></Field>
            <Field label={t.email}><Input name="email" type="email" defaultValue={settings.contact.email} maxLength={120} /></Field>
            <Field label={t.instagram}><Input name="instagram" defaultValue={settings.contact.instagram} maxLength={80} /></Field>
            <Field label={t.address} className="sm:col-span-2"><Input name="address" defaultValue={settings.contact.address} maxLength={200} /></Field>
            <div className="sm:col-span-2"><SubmitButton size="sm">{m.common.save}</SubmitButton></div>
          </ActionForm>
        </Section>

        <Section id="payment" title={t.payment} hint={t.paymentHint}>
          <ActionForm action={savePaymentTextAction} className="space-y-3">
            <Textarea name="instructions" defaultValue={settings.payment.instructions} rows={4} maxLength={2000} aria-label={t.payment} />
            <SubmitButton size="sm">{m.common.save}</SubmitButton>
          </ActionForm>
        </Section>

        <Section id="customs" title={t.customs} hint={t.customsHint}>
          <ActionForm action={saveCustomsTextAction} className="space-y-3">
            <Textarea name="note" defaultValue={settings.customs.note} rows={4} maxLength={2000} aria-label={t.customs} />
            <SubmitButton size="sm">{m.common.save}</SubmitButton>
          </ActionForm>
        </Section>
      </fieldset>
    </div>
  );
}
