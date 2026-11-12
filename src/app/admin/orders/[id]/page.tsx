import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import {
  addChargeAction,
  addNoteAction,
  addTrackingAction,
  deleteMediaAction,
  recordPaymentAction,
  removeTrackingAction,
  sendQuotationAction,
  setPaymentStatusAction,
  updateClassificationAction,
  updateStatusAction,
  updateTrackingAction,
  waiveChargeAction,
} from '@/app/actions/admin';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Breakdown } from '@/components/breakdown';
import { MediaUploader } from '@/components/media-uploader';
import { EventList } from '@/components/order-view';
import { QuoteForm } from '@/components/quote-form';
import { Badge, Card, CardHeader, Field, Input, Row, Select, StatusBadge, Textarea } from '@/components/ui';
import { statusLabel } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { db } from '@/lib/db';
import { fmt, formatAzn, formatDate } from '@/lib/format';
import { computeFinancials, num, orderNo, STATUS, syncQuotationExpiry } from '@/lib/orders';
import { quoteLines, toQuoteView } from '@/lib/quote-view';
import { getCatalog, getSettings } from '@/lib/settings';

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await db.order.findUnique({ where: { id }, select: { id: true } }))) notFound();
  await syncQuotationExpiry(id);

  const [{ m, locale }, order, statuses, catalog, settings] = await Promise.all([
    getI18n(),
    db.order.findUniqueOrThrow({
      where: { id },
      include: {
        status: true,
        user: true,
        media: { orderBy: { createdAt: 'asc' } },
        quotations: { orderBy: { version: 'desc' } },
        payments: { orderBy: { createdAt: 'desc' } },
        charges: { orderBy: { createdAt: 'asc' } },
        tracking: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { createdAt: 'desc' } },
        notes: { orderBy: { createdAt: 'desc' }, include: { author: { select: { name: true } } } },
      },
    }),
    db.orderStatus.findMany({ orderBy: { sortOrder: 'asc' } }),
    getCatalog(),
    getSettings(),
  ]);

  const t = m.admin.order;
  const number = orderNo(order.number);
  const quotes = order.quotations.map(toQuoteView);
  const accepted = quotes.find((q) => q.status === 'ACCEPTED');
  const f = computeFinancials(order);
  const region = catalog.regions.find((r) => r.key === order.regionKey) ?? null;
  const rates = Object.fromEntries(catalog.rates.map((r) => [r.currency, r.rateToAzn]));
  const closed = order.statusKey === STATUS.CANCELLED || order.statusKey === STATUS.COMPLETED;
  const reference = order.media.filter((x) => x.kind === 'CUSTOMER_REFERENCE');
  const inspection = order.media.filter((x) => x.kind !== 'CUSTOMER_REFERENCE');
  const quoteTone = { SENT: 'warn', ACCEPTED: 'accent', REJECTED: 'danger', EXPIRED: 'neutral', SUPERSEDED: 'neutral' } as const;
  const payTone = { PENDING: 'warn', CONFIRMED: 'accent', FAILED: 'danger', REFUNDED: 'neutral' } as const;
  const defaultCurrency = region && rates[region.defaultCurrency] ? region.defaultCurrency : (Object.keys(rates)[0] ?? 'USD');

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/orders" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        {m.admin.orders.title}
      </Link>
      <header className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="tabular text-2xl font-semibold tracking-tight sm:text-3xl">{number}</h1>
        <StatusBadge statusKey={order.statusKey} label={statusLabel(order.status, locale)} />
        {order.type === 'B2B' && <Badge tone="info">B2B</Badge>}
        <span className="text-sm text-muted">{formatDate(order.createdAt, locale, true)}</span>
      </header>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_21rem] xl:items-start">
        <div className="min-w-0 space-y-6">
          {/* ── Request ── */}
          <Card>
            <CardHeader title={t.request} />
            <div className="p-5 sm:p-6">
              <p className="text-lg font-medium break-words">{order.productTitle ?? order.productDescription}</p>
              <dl className="mt-3 divide-y divide-line">
                {order.sourceUrl && (
                  <Row label={m.detail.link}>
                    <a href={order.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1.5 font-medium break-all underline underline-offset-4">
                      {new URL(order.sourceUrl).hostname}
                      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                    </a>
                  </Row>
                )}
                <Row label={m.detail.quantity}>{order.quantity}</Row>
                {order.variant && <Row label={m.detail.variant}>{order.variant}</Row>}
                {order.sizeColor && <Row label={m.detail.sizeColor}>{order.sizeColor}</Row>}
                {order.productTitle && order.productDescription && <Row label={m.detail.description}><span className="whitespace-pre-line">{order.productDescription}</span></Row>}
                {order.instructions && <Row label={m.detail.instructions}><span className="whitespace-pre-line">{order.instructions}</span></Row>}
              </dl>
              {reference.length > 0 && (
                <>
                  <p className="mt-5 mb-3 text-[13px] font-medium text-muted">{t.referenceImages}</p>
                  <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                    {reference.map((item) => (
                      <li key={item.id} className="overflow-hidden rounded-control border border-line">
                        <a href={`/api/media/${item.id}`} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/media/${item.id}`} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </Card>

          {/* ── Quotation ── */}
          <Card>
            <CardHeader title={m.admin.quote.title} hint={accepted ? m.admin.quote.lockedHint : quotes.some((q) => q.status === 'SENT') ? m.admin.quote.replaceHint : undefined} />
            <div className="space-y-6 p-5 sm:p-6">
              {quotes.length > 0 && (
                <div className="space-y-3">
                  {quotes.map((q, i) => (
                    <details key={q.id} open={i === 0} className="rounded-control border border-line">
                      <summary className="tabular flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                        <span className="font-medium">
                          {fmt(m.admin.quote.version, { n: q.version })}
                          <span className="ml-2 font-normal text-muted">{formatDate(q.createdAt, locale, true)}</span>
                        </span>
                        <span className="flex items-center gap-3">
                          {formatAzn(q.totalAzn, locale)}
                          <Badge tone={quoteTone[q.status]}>{m.quote.status[q.status]}</Badge>
                        </span>
                      </summary>
                      <div className="border-t border-line p-4">
                        <Breakdown lines={quoteLines(q, m, locale)} total={{ label: m.quote.total, value: formatAzn(q.totalAzn, locale) }} />
                        <p className="tabular mt-3 text-[12px] text-muted">
                          {fmt(m.quote.rate, { cur: q.currency, rate: q.exchangeRate.toFixed(4) })} · {m.admin.quote.basisOptions[q.commissionBasis]}
                          {q.status === 'SENT' && ` · ${fmt(m.quote.validUntil, { date: formatDate(q.expiresAt, locale, true) })}`}
                        </p>
                        {q.noteToCustomer && <p className="mt-2 text-sm whitespace-pre-line text-ink-soft">{q.noteToCustomer}</p>}
                      </div>
                    </details>
                  ))}
                </div>
              )}
              {!accepted && !closed && (
                <div>
                  <p className="mb-4 text-[15px] font-semibold">{m.admin.quote.new}</p>
                  <QuoteForm
                    action={sendQuotationAction}
                    orderId={order.id}
                    rates={rates}
                    cargo={region ? { perKgUsd: region.cargoPerKgUsd, minWeightKg: region.minBillableWeightKg } : null}
                    customsNote={[region?.customsNote, settings.customs.note].filter(Boolean).join(' ')}
                    defaults={{
                      currency: defaultCurrency,
                      quantity: order.quantity,
                      commissionPercent: region?.commissionPercent ?? 15,
                      commissionBasis: settings.general.commissionBasis,
                      minCommissionAzn: region?.minCommissionAzn ?? 0,
                      validDays: settings.general.quoteValidityDays,
                    }}
                  />
                </div>
              )}
            </div>
          </Card>

          {/* ── Payments & charges ── */}
          <Card>
            <CardHeader title={t.payments} action={accepted && f.balanceAzn === 0 ? <Badge tone="accent">{m.payment.paidInFull}</Badge> : undefined} />
            <div className="p-5 sm:p-6">
              <dl className="tabular grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  [m.payment.quoted, f.quotedAzn],
                  [m.payment.charges, f.chargesAzn],
                  [m.payment.paid, f.paidAzn],
                  [m.payment.balance, f.balanceAzn],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-[12px] text-muted">{label}</dt>
                    <dd className="mt-1 font-medium">{formatAzn(value as number, locale)}</dd>
                  </div>
                ))}
              </dl>

              {order.payments.length > 0 && (
                <ul className="tabular mt-5 divide-y divide-line border-y border-line text-sm">
                  {order.payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <span>
                        <span className="font-medium">{formatAzn(num(p.amount), locale)}</span>
                        <span className="ml-2 text-[12px] text-muted">
                          {m.payment.methods[p.paymentMethod]} · {formatDate(p.createdAt, locale, true)}
                          {p.reference && ` · ${p.reference}`}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge tone={payTone[p.status]}>{m.payment.status[p.status]}</Badge>
                        {p.status === 'PENDING' && (
                          <>
                            <ActionForm action={setPaymentStatusAction}>
                              <input type="hidden" name="paymentId" value={p.id} />
                              <input type="hidden" name="status" value="CONFIRMED" />
                              <SubmitButton size="sm" variant="accent">{t.confirm}</SubmitButton>
                            </ActionForm>
                            <ActionForm action={setPaymentStatusAction}>
                              <input type="hidden" name="paymentId" value={p.id} />
                              <input type="hidden" name="status" value="FAILED" />
                              <SubmitButton size="sm" variant="danger">{t.markFailed}</SubmitButton>
                            </ActionForm>
                          </>
                        )}
                        {p.status === 'CONFIRMED' && (
                          <ActionForm action={setPaymentStatusAction}>
                            <input type="hidden" name="paymentId" value={p.id} />
                            <input type="hidden" name="status" value="REFUNDED" />
                            <SubmitButton size="sm" variant="ghost">{t.refund}</SubmitButton>
                          </ActionForm>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {accepted && (
                <details className="mt-5 rounded-control border border-line">
                  <summary className="px-4 py-3 text-sm font-medium">{t.recordPayment}</summary>
                  <ActionForm action={recordPaymentAction} resetOnSuccess className="grid gap-4 border-t border-line p-4 sm:grid-cols-[8rem_1fr_1fr_auto] sm:items-end">
                    <input type="hidden" name="orderId" value={order.id} />
                    <Field label={m.payment.amount}>
                      <Input key={f.balanceAzn} name="amount" type="number" step="0.01" min="0.01" defaultValue={f.balanceAzn > 0 ? f.balanceAzn.toFixed(2) : ''} required />
                    </Field>
                    <Field label={m.payment.method}>
                      <Select name="method" defaultValue="BANK_TRANSFER">
                        {(['BANK_TRANSFER', 'CARD_TO_CARD', 'CASH', 'ONLINE'] as const).map((k) => (
                          <option key={k} value={k}>{m.payment.methods[k]}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={m.payment.reference}>
                      <Input name="reference" maxLength={120} />
                    </Field>
                    <SubmitButton>{m.common.add}</SubmitButton>
                  </ActionForm>
                </details>
              )}

              <p className="mt-7 mb-3 text-[13px] font-medium text-muted">{t.charges}</p>
              {order.charges.length > 0 && (
                <ul className="tabular mb-4 divide-y divide-line border-y border-line text-sm">
                  {order.charges.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <span className={c.status === 'WAIVED' ? 'text-muted line-through' : ''}>
                        {c.description} — <span className="font-medium">{formatAzn(num(c.amountAzn), locale)}</span>
                      </span>
                      {c.status === 'DUE' ? (
                        <ActionForm action={waiveChargeAction}>
                          <input type="hidden" name="chargeId" value={c.id} />
                          <SubmitButton size="sm" variant="ghost">{t.waive}</SubmitButton>
                        </ActionForm>
                      ) : (
                        <Badge>{m.payment.chargeStatus.WAIVED}</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {accepted && (
                <ActionForm action={addChargeAction} resetOnSuccess className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
                  <input type="hidden" name="orderId" value={order.id} />
                  <Field label={t.chargeDescription}>
                    <Input name="description" maxLength={300} required />
                  </Field>
                  <Field label={m.payment.amount}>
                    <Input name="amountAzn" type="number" step="0.01" min="0.01" required />
                  </Field>
                  <SubmitButton variant="secondary">{t.addCharge}</SubmitButton>
                </ActionForm>
              )}
            </div>
          </Card>

          {/* ── Tracking ── */}
          <Card>
            <CardHeader title={t.tracking} />
            <div className="p-5 sm:p-6">
              {order.tracking.length > 0 && (
                <ul className="mb-5 divide-y divide-line border-y border-line text-sm">
                  {order.tracking.map((tr) => (
                    <li key={tr.id} className="flex flex-wrap items-end justify-between gap-3 py-3">
                      <span>
                        <span className="block text-[12px] text-muted">{tr.carrier}</span>
                        <span className="tabular font-medium break-all">{tr.trackingNumber}</span>
                      </span>
                      <span className="flex items-end gap-2">
                        <ActionForm action={updateTrackingAction} className="flex items-end gap-2">
                          <input type="hidden" name="trackingId" value={tr.id} />
                          <Input name="status" defaultValue={tr.status ?? ''} placeholder={t.trackingStatus} aria-label={t.trackingStatus} className="h-9 w-40" maxLength={120} />
                          <SubmitButton size="sm" variant="secondary">{m.common.save}</SubmitButton>
                        </ActionForm>
                        <ActionForm action={removeTrackingAction}>
                          <input type="hidden" name="trackingId" value={tr.id} />
                          <SubmitButton size="sm" variant="ghost">{m.common.remove}</SubmitButton>
                        </ActionForm>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <ActionForm action={addTrackingAction} resetOnSuccess className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                <input type="hidden" name="orderId" value={order.id} />
                <Field label={t.carrier}><Input name="carrier" maxLength={80} required /></Field>
                <Field label={t.trackingNumber}><Input name="trackingNumber" minLength={3} maxLength={80} required /></Field>
                <Field label={t.trackingStatus}><Input name="status" maxLength={120} /></Field>
                <SubmitButton variant="secondary">{t.addTracking}</SubmitButton>
              </ActionForm>
            </div>
          </Card>

          {/* ── Inspection media ── */}
          <Card>
            <CardHeader title={t.inspectionMedia} />
            <div className="p-5 sm:p-6">
              {inspection.length > 0 && (
                <ul className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {inspection.map((item) => (
                    <li key={item.id} className="overflow-hidden rounded-control border border-line">
                      {item.mimeType.startsWith('video/') ? (
                        <video src={`/api/media/${item.id}`} controls preload="metadata" playsInline className="aspect-square w-full bg-ink object-contain" />
                      ) : (
                        <a href={`/api/media/${item.id}`} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/media/${item.id}`} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                        </a>
                      )}
                      <ActionForm action={deleteMediaAction} className="border-t border-line p-1.5 text-center">
                        <input type="hidden" name="mediaId" value={item.id} />
                        <SubmitButton size="sm" variant="ghost" className="h-7 text-[12px]">{t.delete}</SubmitButton>
                      </ActionForm>
                    </li>
                  ))}
                </ul>
              )}
              <MediaUploader orderId={order.id} labels={{ upload: t.upload, uploading: t.uploading, hint: t.uploadHint, failed: t.uploadFailed }} />
            </div>
          </Card>
        </div>

        {/* ── Side column ── */}
        <aside className="space-y-6">
          <Card>
            <CardHeader title={t.status} />
            <ActionForm action={updateStatusAction} className="space-y-3 p-5">
              <input type="hidden" name="orderId" value={order.id} />
              <Select name="statusKey" defaultValue={order.statusKey} aria-label={t.status} key={order.statusKey}>
                {statuses.filter((s) => s.active || s.key === order.statusKey).map((s) => (
                  <option key={s.key} value={s.key}>{statusLabel(s, locale)}</option>
                ))}
              </Select>
              <SubmitButton className="w-full">{t.updateStatus}</SubmitButton>
            </ActionForm>
          </Card>

          <Card>
            <CardHeader title={t.customer} />
            <div className="p-5 text-sm">
              <p className="font-medium">{order.user.name}</p>
              <p className="mt-1 break-all text-muted">{order.user.email}</p>
              {order.user.phone && <p className="tabular text-muted">{order.user.phone}</p>}
              {order.user.role === 'CUSTOMER' && (
                <Link href={`/admin/customers/${order.user.id}`} className="mt-3 inline-block font-medium underline underline-offset-4">{t.viewCustomer}</Link>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={t.classification} />
            <ActionForm action={updateClassificationAction} className="space-y-3 p-5">
              <input type="hidden" name="orderId" value={order.id} />
              <Field label={t.region}>
                <Select name="regionKey" defaultValue={order.regionKey ?? ''}>
                  <option value="">{t.none}</option>
                  {catalog.regions.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                </Select>
              </Field>
              <Field label={t.marketplace}>
                <Select name="marketplace" defaultValue={order.sourceMarketplace ?? ''}>
                  <option value="">{m.detail.unknownSource}</option>
                  {catalog.marketplaces.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                </Select>
              </Field>
              <Field label={t.type}>
                <Select name="type" defaultValue={order.type}>
                  <option value="PERSONAL">{t.typePersonal}</option>
                  <option value="B2B">{t.typeB2b}</option>
                </Select>
              </Field>
              <SubmitButton variant="secondary" size="sm">{m.common.save}</SubmitButton>
            </ActionForm>
          </Card>

          <Card>
            <CardHeader title={t.notes} hint={t.notesHint} />
            <div className="p-5">
              <ActionForm action={addNoteAction} resetOnSuccess className="space-y-3">
                <input type="hidden" name="orderId" value={order.id} />
                <Textarea name="body" placeholder={t.notePh} rows={3} required maxLength={4000} aria-label={t.notes} />
                <SubmitButton variant="secondary" size="sm">{t.addNote}</SubmitButton>
              </ActionForm>
              {order.notes.length > 0 && (
                <ul className="mt-5 space-y-4">
                  {order.notes.map((n) => (
                    <li key={n.id} className="text-sm">
                      <p className="leading-relaxed whitespace-pre-line">{n.body}</p>
                      <p className="mt-1 text-[12px] text-muted">{n.author.name} · {formatDate(n.createdAt, locale, true)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title={t.history} />
            <div className="px-5 py-3">
              <EventList events={order.events} m={m} statuses={statuses} locale={locale} internalLabel={t.internal} />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
