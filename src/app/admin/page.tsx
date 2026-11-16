import Link from 'next/link';
import { MonthlyOrdersChart } from '@/components/admin-charts';
import { Card, CardHeader, StatusBadge } from '@/components/ui';
import { statusLabel } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { db } from '@/lib/db';
import { formatAzn, formatDate } from '@/lib/format';
import { num, orderNo, PENDING_STATUSES, STATUS } from '@/lib/orders';
import { orderSummary } from '@/lib/quote-view';
import { attentionItems } from '@/lib/daily';

export default async function AdminOverviewPage() {
  const { m, locale } = await getI18n();
  const o = m.admin.overview;

  const since = new Date();
  since.setMonth(since.getMonth() - 5, 1);
  since.setHours(0, 0, 0, 0);

  // "Confirmed" = paid and beyond (not pending, not cancelled).
  const confirmedWhere = { statusKey: { notIn: [...PENDING_STATUSES, STATUS.CANCELLED] } };

  const [total, pending, confirmed, collected, service, aov, byMarket, recentDates, marketplaces, latest] = await Promise.all([
    db.order.count(),
    db.order.count({ where: { statusKey: { in: PENDING_STATUSES } } }),
    db.order.count({ where: confirmedWhere }),
    db.payment.aggregate({ _sum: { amount: true }, where: { status: 'CONFIRMED' } }),
    db.quotation.aggregate({ _sum: { serviceFeeAzn: true, sourcingFeeAzn: true }, where: { status: 'ACCEPTED', order: confirmedWhere } }),
    db.quotation.aggregate({ _avg: { totalAzn: true }, where: { status: 'ACCEPTED' } }),
    db.orderItem.groupBy({ by: ['sourceMarketplace'], _count: { _all: true } }),
    db.order.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    db.marketplace.findMany({ select: { key: true, name: true } }),
    db.order.findMany({ orderBy: { createdAt: 'desc' }, take: 6, include: { status: true, user: { select: { name: true } }, items: { orderBy: { position: 'asc' }, select: { title: true, description: true, method: true, sourceMarketplace: true, quantity: true } } } }),
  ]);

  const months: { key: string; month: string; orders: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(since.getFullYear(), since.getMonth() + i, 1);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      month: new Intl.DateTimeFormat(locale === 'az' ? 'az-Latn-AZ' : locale, { month: 'short' }).format(d),
      orders: 0,
    });
  }
  for (const r of recentDates) {
    const bucket = months.find((x) => x.key === `${r.createdAt.getFullYear()}-${r.createdAt.getMonth()}`);
    if (bucket) bucket.orders += 1;
  }

  const markets = byMarket
    .map((g) => ({ name: marketplaces.find((x) => x.key === g.sourceMarketplace)?.name ?? o.other, count: g._count._all }))
    .reduce<{ name: string; count: number }[]>((acc, g) => {
      const hit = acc.find((x) => x.name === g.name);
      if (hit) hit.count += g.count;
      else acc.push({ ...g });
      return acc;
    }, [])
    .sort((a, b) => b.count - a.count);
  const maxMarket = Math.max(1, ...markets.map((x) => x.count));

  const serviceRevenue = num(service._sum.serviceFeeAzn) + num(service._sum.sourcingFeeAzn);
  const cards = [
    { label: o.totalOrders, value: String(total) },
    { label: o.pending, value: String(pending), hint: o.pendingHint },
    { label: o.confirmed, value: String(confirmed), hint: o.confirmedHint },
    { label: o.serviceRevenue, value: formatAzn(serviceRevenue, locale), hint: o.serviceHint, accent: true },
    { label: o.collected, value: formatAzn(num(collected._sum.amount), locale), hint: o.collectedHint },
    { label: o.aov, value: formatAzn(num(aov._avg.totalAzn), locale), hint: o.aovHint },
  ];

  const attention = await attentionItems();
  const attentionGroups = [
    { label: o.attention.reported, rows: attention.reported, urgent: true },
    { label: o.attention.noQuote, rows: attention.noQuote, urgent: true },
    { label: o.attention.expiring, rows: attention.expiring, urgent: false },
    { label: o.attention.unpaid, rows: attention.unpaid, urgent: false },
    { label: o.attention.delayed, rows: attention.delayed, urgent: false },
    { label: o.attention.decisions, rows: attention.decisions, urgent: false },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{o.title}</h1>

      {/* ── needs attention ── */}
      <Card className="mt-6">
        <CardHeader title={o.attention.title} />
        {attentionGroups.every((g) => g.rows.length === 0) ? (
          <p className="px-5 py-4 text-sm text-muted sm:px-6">{o.attention.empty}</p>
        ) : (
          <div className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-3">
            {attentionGroups
              .filter((g) => g.rows.length > 0)
              .map((g) => (
                <div key={g.label} className="bg-surface p-5">
                  <p className="flex items-center justify-between text-[13px] font-semibold">
                    {g.label}
                    <span className={`tabular rounded-full px-2 py-0.5 text-[12px] ${g.urgent ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn'}`}>{g.rows.length}</span>
                  </p>
                  <ul className="mt-3 space-y-1.5 text-[13px]">
                    {g.rows.slice(0, 5).map((r) => (
                      <li key={r.id}>
                        <Link href={`/admin/orders/${r.id}`} className="flex justify-between gap-3 hover:text-accent">
                          <span className="truncate"><span className="tabular text-muted">{orderNo(r.number)}</span> · {r.customer}</span>
                          <span className="tabular shrink-0 text-muted">{formatDate(r.since, locale)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </Card>

      <dl className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label} className="p-5">
            <dt className="text-[13px] text-muted">{c.label}</dt>
            <dd className={`tabular mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl ${c.accent ? 'text-accent' : ''}`}>{c.value}</dd>
            {c.hint && <p className="mt-2 text-[12px] leading-relaxed text-muted">{c.hint}</p>}
          </Card>
        ))}
      </dl>
      <p className="mt-3 text-[12px] text-muted">{o.profitNote}</p>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title={o.monthly} />
          <div className="p-4 sm:p-5">
            <MonthlyOrdersChart data={months.map(({ month, orders }) => ({ month, orders }))} label={m.admin.nav.orders} />
          </div>
        </Card>
        <Card>
          <CardHeader title={o.marketplaces} />
          <div className="space-y-4 p-5 sm:p-6">
            {markets.length === 0 && <p className="text-sm text-muted">{o.noData}</p>}
            {markets.map((x) => (
              <div key={x.name}>
                <div className="tabular flex justify-between text-sm">
                  <span>{x.name}</span>
                  <span className="text-muted">{x.count}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-paper">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(x.count / maxMarket) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title={o.recent} action={<Link href="/admin/orders" className="text-sm font-medium underline underline-offset-4">{m.common.all}</Link>} />
        <ul className="divide-y divide-line">
          {latest.map((order) => (
            <li key={order.id}>
              <Link href={`/admin/orders/${order.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-5 py-3.5 text-sm hover:bg-paper/60 sm:px-6">
                <span className="min-w-0 flex-1">
                  <span className="tabular mr-3 text-muted">{orderNo(order.number)}</span>
                  <span className="font-medium">{orderSummary(order.items, m.dash.photoRequest)}</span>
                  <span className="ml-2 text-muted">· {order.user.name}</span>
                </span>
                <span className="flex items-center gap-3">
                  <StatusBadge statusKey={order.statusKey} label={statusLabel(order.status, locale)} />
                  <span className="tabular hidden text-[12px] text-muted sm:inline">{formatDate(order.createdAt, locale)}</span>
                </span>
              </Link>
            </li>
          ))}
          {latest.length === 0 && <li className="px-6 py-8 text-center text-sm text-muted">{o.noData}</li>}
        </ul>
      </Card>
    </div>
  );
}
