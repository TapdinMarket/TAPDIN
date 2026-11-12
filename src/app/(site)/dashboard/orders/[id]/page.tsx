import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, MessageCircle } from 'lucide-react';
import { acceptQuotationAction, rejectQuotationAction, reportPaymentAction } from '@/app/actions/customer';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Breakdown } from '@/components/breakdown';
import { EventList, MediaGrid, OrderTimeline } from '@/components/order-view';
import { Badge, Card, CardHeader, Container, Field, Input, Row, Select, StatusBadge } from '@/components/ui';
import { statusLabel } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmt, formatAzn, formatDate } from '@/lib/format';
import { computeFinancials, num, orderNo, STATUS, syncQuotationExpiry } from '@/lib/orders';
import { quoteLines, toQuoteView } from '@/lib/quote-view';
import { getSettings } from '@/lib/settings';

export const metadata: Metadata = { title: 'Order' };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/dashboard/orders/${id}`);

  // Ownership check is in the query itself.
  const exists = await db.order.findFirst({ where: { id, userId: user.id }, select: { id: true } });
  if (!exists) notFound();
  await syncQuotationExpiry(id);

  const [{ m, locale }, order, statuses, settings, marketplaces] = await Promise.all([
    getI18n(),
    db.order.findUniqueOrThrow({
      where: { id },
      include: {
        status: true,
        media: { orderBy: { createdAt: 'asc' } },
        quotations: { orderBy: { version: 'desc' } },
        payments: { orderBy: { createdAt: 'desc' } },
        charges: { orderBy: { createdAt: 'asc' } },
        tracking: { orderBy: { createdAt: 'asc' } },
        events: { where: { visible: true }, orderBy: { createdAt: 'desc' } },
      },
    }),
    db.orderStatus.findMany({ orderBy: { sortOrder: 'asc' } }),
    getSettings(),
    db.marketplace.findMany({ select: { key: true, name: true } }),
  ]);

  const d = m.detail;
  const number = orderNo(order.number);
  const quotes = order.quotations.map(toQuoteView);
  const accepted = quotes.find((q) => q.status === 'ACCEPTED');
  const open = quotes.find((q) => q.status === 'SENT');
  const shown = accepted ?? open ?? quotes[0];
  const earlier = quotes.filter((q) => q.id !== shown?.id);
  const f = computeFinancials(order);
  const reference = order.media.filter((x) => x.kind === 'CUSTOMER_REFERENCE');
  const inspection = order.media.filter((x) => x.kind !== 'CUSTOMER_REFERENCE');
  const cancelled = order.statusKey === STATUS.CANCELLED;

  const reachedAt: Record<string, Date> = {};
  for (const e of [...order.events].reverse()) if (e.status) reachedAt[e.status] = e.createdAt;

  const quoteTone = { SENT: 'warn', ACCEPTED: 'accent', REJECTED: 'danger', EXPIRED: 'neutral', SUPERSEDED: 'neutral' } as const;
  const payTone = { PENDING: 'warn', CONFIRMED: 'accent', FAILED: 'danger', REFUNDED: 'neutral' } as const;
  const supportHref = settings.contact.whatsapp
    ? `https://wa.me/${settings.contact.whatsapp}?text=${encodeURIComponent(fmt(d.supportMessage, { number }))}`
    : `mailto:${settings.contact.email}?subject=${encodeURIComponent(number)}`;
  // Offer the form only while part of the balance is neither paid nor already reported.
  const canReport = accepted && f.balanceAzn - f.pendingAzn > 0 && !cancelled && order.payments.filter((p) => p.status === 'PENDING').length < 3;

  return (
    <Container className="py-8 lg:py-12">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        {m.dash.title}
      </Link>

      <header className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="tabular text-sm text-muted">{d.order} {number}</span>
            <StatusBadge statusKey={order.statusKey} label={statusLabel(order.status, locale)} />
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em] break-words sm:text-3xl">{order.productTitle ?? order.productDescription ?? m.dash.photoRequest}</h1>
          <p className="mt-1.5 text-sm text-muted">{fmt(d.placed, { date: formatDate(order.createdAt, locale) })}</p>
        </div>
      </header>

      {cancelled && <p className="mt-6 rounded-control bg-danger-soft px-4 py-3 text-sm text-danger">{d.cancelled}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="space-y-6">
          {/* ── Quotation ── */}
          <Card>
            <CardHeader
              title={accepted ? m.quote.confirmed : m.quote.title}
              action={shown && <Badge tone={quoteTone[shown.status]}>{m.quote.status[shown.status]}</Badge>}
              hint={shown?.status === 'SENT' ? fmt(m.quote.validUntil, { date: formatDate(shown.expiresAt, locale, true) }) : undefined}
            />
            <div className="p-5 sm:p-6">
              {!shown ? (
                <p className="text-sm leading-relaxed text-muted">{m.quote.waiting}</p>
              ) : (
                <>
                  <Breakdown lines={quoteLines(shown, m, locale)} total={{ label: m.quote.total, value: formatAzn(shown.totalAzn, locale) }} />
                  <p className="tabular mt-4 text-[12px] text-muted">{fmt(m.quote.rate, { cur: shown.currency, rate: shown.exchangeRate.toFixed(4) })}</p>
                  {shown.noteToCustomer && (
                    <div className="mt-4 rounded-control bg-paper px-4 py-3 text-sm">
                      <p className="text-[12px] font-medium text-muted">{m.quote.note}</p>
                      <p className="mt-1 leading-relaxed whitespace-pre-line">{shown.noteToCustomer}</p>
                    </div>
                  )}
                  {shown.status === 'EXPIRED' && <p className="mt-4 text-sm text-muted">{m.quote.expiredText}</p>}
                  {shown.status === 'REJECTED' && <p className="mt-4 text-sm text-muted">{m.quote.rejectedText}</p>}
                  {shown.status === 'SENT' && !cancelled && (
                    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                      <ActionForm action={acceptQuotationAction} className="flex-1">
                        <input type="hidden" name="quotationId" value={shown.id} />
                        <SubmitButton variant="accent" size="lg" className="w-full">{m.quote.accept}</SubmitButton>
                      </ActionForm>
                      <ActionForm action={rejectQuotationAction}>
                        <input type="hidden" name="quotationId" value={shown.id} />
                        <SubmitButton variant="secondary" size="lg" className="w-full">{m.quote.reject}</SubmitButton>
                      </ActionForm>
                    </div>
                  )}
                  <p className="mt-5 text-[12px] leading-relaxed text-muted">{m.quote.disclaimer}</p>
                </>
              )}
              {earlier.length > 0 && (
                <details className="mt-5 border-t border-line pt-4 text-sm">
                  <summary className="text-muted hover:text-ink">{m.quote.earlier} ({earlier.length})</summary>
                  <ul className="tabular mt-3 space-y-2">
                    {earlier.map((q) => (
                      <li key={q.id} className="flex items-center justify-between gap-3">
                        <span className="text-muted">v{q.version} · {formatDate(q.createdAt, locale)}</span>
                        <span className="flex items-center gap-3">
                          {formatAzn(q.totalAzn, locale)}
                          <Badge tone={quoteTone[q.status]}>{m.quote.status[q.status]}</Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </Card>

          {/* ── Payment ── */}
          {accepted && (
            <Card>
              <CardHeader title={m.payment.title} action={f.balanceAzn === 0 ? <Badge tone="accent">{m.payment.paidInFull}</Badge> : undefined} />
              <div className="p-5 sm:p-6">
                <dl className="tabular divide-y divide-line">
                  <Row label={m.payment.quoted}>{formatAzn(f.quotedAzn, locale)}</Row>
                  {order.charges.map((c) => (
                    <Row key={c.id} label={`${m.payment.charges}: ${c.description}`}>
                      <span className={c.status === 'WAIVED' ? 'text-muted line-through' : ''}>{formatAzn(num(c.amountAzn), locale)}</span>
                      {c.status === 'WAIVED' && <span className="ml-2 text-[12px] text-muted">{m.payment.chargeStatus.WAIVED}</span>}
                    </Row>
                  ))}
                  <Row label={m.payment.paid}>{formatAzn(f.paidAzn, locale)}</Row>
                  {f.pendingAzn > 0 && <Row label={m.payment.pending}>{formatAzn(f.pendingAzn, locale)}</Row>}
                  <div className="flex items-baseline justify-between pt-3.5">
                    <dt className="font-medium">{m.payment.balance}</dt>
                    <dd className="font-display text-xl font-semibold">{formatAzn(f.balanceAzn, locale)}</dd>
                  </div>
                </dl>

                {f.balanceAzn > 0 && !cancelled && (
                  <div className="mt-6 rounded-control bg-paper p-4">
                    <p className="text-sm font-medium">{m.payment.howTitle}</p>
                    <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-soft">{settings.payment.instructions}</p>
                    <p className="mt-3 text-[12px] text-muted">{m.payment.noOnline}</p>
                  </div>
                )}

                {canReport && (
                  <details className="mt-5 rounded-control border border-line">
                    <summary className="px-4 py-3 text-sm font-medium">{m.payment.report}</summary>
                    <ActionForm action={reportPaymentAction} resetOnSuccess className="space-y-4 border-t border-line p-4">
                      <input type="hidden" name="orderId" value={order.id} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={m.payment.amount}>
                          <Input name="amount" type="number" step="0.01" min="0.01" max={f.balanceAzn} defaultValue={Math.max(0, f.balanceAzn - f.pendingAzn).toFixed(2)} required />
                        </Field>
                        <Field label={m.payment.method}>
                          <Select name="method" defaultValue="CARD_TO_CARD">
                            {(['CARD_TO_CARD', 'BANK_TRANSFER', 'CASH'] as const).map((k) => (
                              <option key={k} value={k}>{m.payment.methods[k]}</option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                      <Field label={m.payment.reference} optional={m.common.optional}>
                        <Input name="reference" maxLength={120} />
                      </Field>
                      <SubmitButton>{m.payment.report}</SubmitButton>
                    </ActionForm>
                  </details>
                )}

                {order.payments.length > 0 && (
                  <div className="mt-6">
                    <p className="text-[13px] font-medium text-muted">{m.payment.list}</p>
                    <ul className="tabular mt-2 divide-y divide-line text-sm">
                      {order.payments.map((p) => (
                        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                          <span>
                            {formatAzn(num(p.amount), locale)}
                            <span className="ml-2 text-[12px] text-muted">{m.payment.methods[p.paymentMethod]} · {formatDate(p.createdAt, locale)}</span>
                          </span>
                          <Badge tone={payTone[p.status]}>{m.payment.status[p.status]}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* ── Inspection ── */}
          <Card>
            <CardHeader title={d.inspection} />
            <div className="p-5 sm:p-6">
              {inspection.length === 0 ? <p className="text-sm text-muted">{d.inspectionEmpty}</p> : <MediaGrid media={inspection} />}
            </div>
          </Card>

          {/* ── Shipping ── */}
          <Card>
            <CardHeader title={d.shipping} />
            <div className="p-5 sm:p-6">
              {order.tracking.length === 0 ? (
                <p className="text-sm text-muted">{d.shippingEmpty}</p>
              ) : (
                <ul className="divide-y divide-line">
                  {order.tracking.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div>
                        <p className="text-[12px] text-muted">{t.carrier}</p>
                        <p className="tabular font-medium break-all select-all">{t.trackingNumber}</p>
                      </div>
                      {t.status && <Badge tone="info">{t.status}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {/* ── Request details ── */}
          <Card>
            <CardHeader title={d.product} />
            <div className="p-5 sm:p-6">
              <dl className="divide-y divide-line">
                <Row label={d.source}>{marketplaces.find((x) => x.key === order.sourceMarketplace)?.name ?? (order.method === 'IMAGE' ? m.dash.photoRequest : d.unknownSource)}</Row>
                {order.sourceUrl && (
                  <Row label={d.link}>
                    <a href={order.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 font-medium underline underline-offset-4">
                      {d.openLink}
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  </Row>
                )}
                <Row label={d.quantity}>{order.quantity}</Row>
                {order.variant && <Row label={d.variant}>{order.variant}</Row>}
                {order.sizeColor && <Row label={d.sizeColor}>{order.sizeColor}</Row>}
                {order.productDescription && <Row label={d.description}><span className="whitespace-pre-line">{order.productDescription}</span></Row>}
                {order.instructions && <Row label={d.instructions}><span className="whitespace-pre-line">{order.instructions}</span></Row>}
              </dl>
              {reference.length > 0 && (
                <>
                  <p className="mt-5 mb-3 text-[13px] font-medium text-muted">{d.photos}</p>
                  <MediaGrid media={reference} />
                </>
              )}
            </div>
          </Card>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24">
          {!cancelled && (
            <Card className="p-5 sm:p-6">
              <h2 className="mb-5 text-[15px] font-semibold">{d.progress}</h2>
              <OrderTimeline statuses={statuses} currentKey={order.statusKey} reachedAt={reachedAt} locale={locale} />
            </Card>
          )}
          <Card className="p-5 sm:p-6">
            <h2 className="mb-2 text-[15px] font-semibold">{d.history}</h2>
            <EventList events={order.events} m={m} statuses={statuses} locale={locale} />
          </Card>
          <a href={supportHref} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-5 py-3 text-sm font-medium hover:border-ink/40">
            <MessageCircle className="size-4 text-accent" aria-hidden />
            {d.support}
          </a>
        </aside>
      </div>
    </Container>
  );
}
