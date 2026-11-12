import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ChevronRight, Mail, MessageCircle, Phone, Plus } from 'lucide-react';
import { ButtonLink, Card, Container, EmptyState, StatusBadge } from '@/components/ui';
import { statusLabel } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { fmt, formatAzn, formatDate } from '@/lib/format';
import { num, orderNo, STATUS } from '@/lib/orders';
import { getSettings } from '@/lib/settings';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.dash.title };
}

export default async function DashboardPage() {
  const user = await requireUser('/dashboard');
  const [{ m, locale }, orders, marketplaces, { contact }] = await Promise.all([
    getI18n(),
    // Data isolation: every customer query is scoped by the session user id.
    db.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { status: true, quotations: { where: { status: { in: ['SENT', 'ACCEPTED'] } }, orderBy: { version: 'desc' }, take: 1 } },
    }),
    db.marketplace.findMany({ select: { key: true, name: true } }),
    getSettings(),
  ]);
  const d = m.dash;
  const marketName = (key: string | null) => marketplaces.find((x) => x.key === key)?.name ?? null;

  const count = (fn: (key: string) => boolean) => orders.filter((o) => fn(o.statusKey)).length;
  const closed: string[] = [STATUS.COMPLETED, STATUS.CANCELLED];
  const early: string[] = [STATUS.AWAITING_APPROVAL, STATUS.AWAITING_PAYMENT];
  const stats = [
    { label: d.needApproval, value: count((k) => k === STATUS.AWAITING_APPROVAL), attention: true },
    { label: d.needPayment, value: count((k) => k === STATUS.AWAITING_PAYMENT), attention: true },
    { label: d.inProgress, value: count((k) => !closed.includes(k) && !early.includes(k)), attention: false },
    { label: d.completed, value: count((k) => k === STATUS.COMPLETED), attention: false },
  ];

  return (
    <Container className="py-10 lg:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{d.title}</h1>
          <p className="mt-2 text-ink-soft">{fmt(d.subtitle, { name: user.name.split(' ')[0] })}</p>
        </div>
        <ButtonLink href="/order">
          <Plus className="size-4" aria-hidden />
          {d.newOrder}
        </ButtonLink>
      </div>

      {orders.length > 0 && (
        <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-surface p-5">
              <dt className="text-[13px] text-muted">{s.label}</dt>
              <dd className={`tabular mt-2 font-display text-3xl font-semibold ${s.attention && s.value > 0 ? 'text-warn' : ''}`}>{s.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_19rem] lg:items-start">
        <Card>
          {orders.length === 0 ? (
            <EmptyState
              title={d.emptyTitle}
              text={d.emptyText}
              action={
                <ButtonLink href="/order">
                  {m.nav.order}
                  <ArrowRight className="size-4" aria-hidden />
                </ButtonLink>
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {orders.map((o) => {
                const quote = o.quotations[0];
                return (
                  <li key={o.id}>
                    <Link href={`/dashboard/orders/${o.id}`} className="group flex items-center gap-4 px-5 py-4.5 transition-colors hover:bg-paper/60 sm:px-6">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <span className="tabular text-[13px] text-muted">{orderNo(o.number)}</span>
                          <StatusBadge statusKey={o.statusKey} label={statusLabel(o.status, locale)} />
                        </div>
                        <p className="mt-2 truncate font-medium">{o.productTitle ?? o.productDescription ?? d.photoRequest}</p>
                        <p className="mt-1 text-[13px] text-muted">
                          {[marketName(o.sourceMarketplace) ?? (o.method === 'IMAGE' ? d.photoRequest : m.detail.unknownSource), fmt(d.qty, { n: o.quantity }), formatDate(o.createdAt, locale)].join(' · ')}
                        </p>
                      </div>
                      {quote && (
                        <div className="hidden text-right sm:block">
                          <p className="text-[12px] text-muted">{d.total}</p>
                          <p className="tabular font-medium">{formatAzn(num(quote.totalAzn), locale)}</p>
                        </div>
                      )}
                      <ChevronRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="p-6">
          <h2 className="font-semibold">{d.supportTitle}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{d.supportText}</p>
          <div className="mt-5 flex flex-col gap-2">
            {contact.whatsapp && (
              <a href={`https://wa.me/${contact.whatsapp}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-control border border-line px-3.5 py-3 text-sm font-medium hover:border-ink/40">
                <MessageCircle className="size-4 text-accent" aria-hidden />
                {d.whatsapp}
              </a>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="flex items-center gap-3 rounded-control border border-line px-3.5 py-3 text-sm font-medium hover:border-ink/40">
                <Mail className="size-4 text-accent" aria-hidden />
                {contact.email}
              </a>
            )}
            {contact.phone && (
              <a href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`} className="flex items-center gap-3 rounded-control border border-line px-3.5 py-3 text-sm font-medium hover:border-ink/40">
                <Phone className="size-4 text-accent" aria-hidden />
                {contact.phone}
              </a>
            )}
          </div>
        </Card>
      </div>
    </Container>
  );
}
