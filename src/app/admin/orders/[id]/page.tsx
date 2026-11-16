import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MessageCircle } from 'lucide-react';
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
  updateItemMarketplaceAction,
  setItemAvailabilityAction,
  updateStatusAction,
  updateTrackingAction,
  waiveChargeAction,
} from '@/app/actions/admin';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Breakdown } from '@/components/breakdown';
import { MediaUploader } from '@/components/media-uploader';
import { EventList } from '@/components/order-view';
import { QuoteForm } from '@/components/quote-form';
import { OrderItems } from '@/components/order-items';
import { Badge, Card, CardHeader, Field, Input, Row, Select, StatusBadge, Textarea } from '@/components/ui';
import { statusLabel } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { db } from '@/lib/db';
import { fmt, formatAzn, formatDate } from '@/lib/format';
import { computeFinancials, num, orderNo, STATUS, syncQuotationExpiry } from '@/lib/orders';
import { itemLabel, quoteLines, toQuoteView } from '@/lib/quote-view';
import { isComingSoon } from '@/lib/regions';
import { whatsappNumber } from '@/lib/notifications/messages';

/** First line of a message staff send from their own WhatsApp, in the customer's language. */
const staffGreeting = (locale: string, name: string, orderNo: string) =>
  locale === 'ru' ? `Здравствуйте, ${name}! Пишем по заказу ${orderNo} в tapdın.` : locale === 'en' ? `Hello ${name}! We are writing about your tapdın order ${orderNo}.` : `Salam, ${name}! tapdın-dakı ${orderNo} sifarişiniz barədə yazırıq.`;
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
        items: { orderBy: { position: 'asc' } },
        media: { orderBy: { createdAt: 'asc' } },
        quotations: { orderBy: { version: 'desc' }, include: { lines: true } },
        payments: { orderBy: { createdAt: 'desc' } },
        charges: { orderBy: { createdAt: 'asc' } },
        tracking: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { createdAt: 'desc' } },
        notes: { orderBy: { createdAt: 'desc' }, include: { author: { select: { name: true } } } },
        notifications: { orderBy: { createdAt: 'desc' }, take: 30 },
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
  const rates: Record<string, number> = { AZN: 1, ...Object.fromEntries(catalog.rates.map((r) => [r.currency, r.rateToAzn])) };
  const azn: Record<string, number> = rates;
  const closed = order.statusKey === STATUS.CANCELLED || order.statusKey === STATUS.COMPLETED;
  const paidOrReported = order.payments.some((p) => p.status === 'CONFIRMED' || p.status === 'PENDING');
  const waitingDecision = order.items.filter((i) => i.unavailable && i.resolution === 'PENDING').length;
  const itemName = (itemId: string, index: number) => `${index + 1}. ${itemLabel(order.items.find((x) => x.id === itemId) ?? { title: null, description: null }, m.dash.photoRequest)}`;
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
          {/* ── Items ── */}
          <Card>
            <CardHeader title={order.items.length > 1 ? fmt(m.dash.itemsCount, { n: order.items.length }) : t.request} />
            <div className="space-y-4 p-5 sm:p-6">
              <OrderItems
                items={order.items}
                media={order.media}
                marketplaces={catalog.marketplaces}
                rates={azn}
                m={m}
                locale={locale}
                clientPriceLabel={m.detail.clientPriceStaff}
                extra={(item) => (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                  {item.unavailable && item.resolution === 'PENDING' && <Badge tone="warn">{t.awaitingDecision}</Badge>}
                  {!paidOrReported && item.resolution !== 'REPLACED' && (
                    <ActionForm action={setItemAvailabilityAction}>
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="unavailable" value={item.unavailable ? 'false' : 'true'} />
                      <SubmitButton size="sm" variant={item.unavailable ? 'secondary' : 'danger'}>{item.unavailable ? t.markAvailable : t.markUnavailable}</SubmitButton>
                    </ActionForm>
                  )}
                  <ActionForm action={updateItemMarketplaceAction} className="flex flex-1 flex-wrap items-end gap-2">
                    <input type="hidden" name="itemId" value={item.id} />
                    <Field label={t.marketplace} className="min-w-48 flex-1">
                      <Select name="marketplace" defaultValue={item.sourceMarketplace ?? ''}>
                        <option value="">{m.detail.unknownSource}</option>
                        {catalog.marketplaces.map((x) => <option key={x.key} value={x.key}>{x.name}</option>)}
                      </Select>
                    </Field>
                    <SubmitButton size="sm" variant="secondary">{m.common.save}</SubmitButton>
                  </ActionForm>
                  </div>
                )}
              />
              {!paidOrReported && <p className="text-[12px] leading-relaxed text-muted">{t.unavailableHint}</p>}
              {order.instructions && (
                <dl className="divide-y divide-line">
                  <Row label={m.detail.instructions}><span className="whitespace-pre-line">{order.instructions}</span></Row>
                </dl>
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
                        <Breakdown lines={quoteLines(q, m, locale, itemName)} total={{ label: m.quote.total, value: formatAzn(q.totalAzn, locale) }} />
                        <p className="tabular mt-3 text-[12px] text-muted">
                          {[...new Map(q.lines.map((l) => [l.currency, l.exchangeRate])).entries()].map(([cur, rate]) => fmt(m.quote.rate, { cur, rate: rate.toFixed(4) })).join(' · ')} · {m.admin.quote.basisOptions[q.commissionBasis]}
                          {q.status === 'SENT' && ` · ${fmt(m.quote.validUntil, { date: formatDate(q.expiresAt, locale, true) })}`}
                        </p>
                        {q.noteToCustomer && <p className="mt-2 text-sm whitespace-pre-line text-ink-soft">{q.noteToCustomer}</p>}
                      </div>
                    </details>
                  ))}
                </div>
              )}
              {!accepted && !closed && isComingSoon(region) && (
                <p className="rounded-control border border-dashed border-line-strong px-4 py-3.5 text-sm leading-relaxed text-ink-soft">
                  <Badge tone="warn" className="mr-2">{m.soon.badge}</Badge>
                  {m.admin.quote.regionSoon}
                </p>
              )}
              {!accepted && !closed && waitingDecision > 0 && (
                <p className="rounded-control bg-warn-soft px-4 py-3 text-sm text-warn">{t.awaitingDecision}: {waitingDecision}</p>
              )}
              {!accepted && !closed && !isComingSoon(region) && order.items.every((i) => i.unavailable) && (
                <p className="rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">{m.admin.quote.noItems}</p>
              )}
              {!accepted && !closed && !isComingSoon(region) && order.items.some((i) => !i.unavailable) && (
                <div>
                  <p className="mb-4 text-[15px] font-semibold">{m.admin.quote.new}</p>
                  <QuoteForm
                    action={sendQuotationAction}
                    orderId={order.id}
                    rateInfo={Object.fromEntries(catalog.rates.map((r) => [r.currency, { source: r.source, updatedAt: r.updatedAt.toISOString() }]))}
                    items={order.items.filter((item) => !item.unavailable).map((item, i) => ({
                      id: item.id,
                      label: itemLabel(item, `#${i + 1}`),
                      quantity: item.quantity,
                      clientPrice: item.clientPrice === null ? null : Number(item.clientPrice),
                      clientCurrency: item.clientCurrency,
                    }))}
                    rates={rates}
                    cargo={region ? { perKgUsd: region.cargoPerKgUsd, minWeightKg: region.minBillableWeightKg } : null}
                    customsNote={[region?.customsNote, settings.customs.note].filter(Boolean).join(' ')}
                    defaults={{
                      currency: defaultCurrency,
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
              {whatsappNumber(order.user.phone) && (
                <a
                  href={`https://wa.me/${whatsappNumber(order.user.phone)}?text=${encodeURIComponent(staffGreeting(order.user.locale, order.user.name, number))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex w-fit items-center gap-2 rounded-full border border-line-strong px-3.5 py-2 text-[13px] font-medium transition-colors hover:border-accent hover:text-accent"
                >
                  <MessageCircle className="size-4" aria-hidden />
                  {t.whatsapp}
                </a>
              )}
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
                  {catalog.regions.map((r) => <option key={r.key} value={r.key}>{isComingSoon(r) ? fmt(m.order.regionSoonOption, { region: r.name }) : r.name}</option>)}
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
            <CardHeader title={m.notify.logTitle} />
            <div className="px-5 py-3">
              {order.notifications.length === 0 ? (
                <p className="py-2 text-sm text-muted">{m.notify.logEmpty}</p>
              ) : (
                <ul className="divide-y divide-line text-[13px]">
                  {order.notifications.map((n) => {
                    const [event, statusKey] = n.event.split(':');
                    const what = event === 'status_update' && statusKey ? statusLabel(statuses.find((s) => s.key === statusKey) ?? { labelAz: statusKey, labelRu: statusKey, labelEn: statusKey }, locale) : (m.notify.events as Record<string, string>)[event] ?? event;
                    return (
                      <li key={n.id} className="py-2.5" title={n.detail ?? undefined}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium">{what}</span>
                          <Badge tone={n.status === 'SENT' ? 'accent' : n.status === 'FAILED' ? 'danger' : 'neutral'}>
                            {n.channel === 'EMAIL' ? 'Email' : 'WhatsApp'} · {m.notify.status[n.status]}
                          </Badge>
                        </div>
                        <p className="mt-1 text-[12px] text-muted">
                          {formatDate(n.createdAt, locale, true)}
                          {n.detail && <span className="block truncate">{n.detail}</span>}
                        </p>
                      </li>
                    );
                  })}
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
