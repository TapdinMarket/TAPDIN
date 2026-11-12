import type { Prisma } from '@prisma/client';
import Link from 'next/link';
import { buttonClass, Card, EmptyState, Input, Select, StatusBadge } from '@/components/ui';
import { statusLabel } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { db } from '@/lib/db';
import { formatAzn, formatDate } from '@/lib/format';
import { num, orderNo } from '@/lib/orders';

const PAGE_SIZE = 30;

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const [{ m, locale }, params] = await Promise.all([getI18n(), searchParams]);
  const t = m.admin.orders;
  const q = (params.q ?? '').trim().slice(0, 100);
  const status = params.status ?? '';
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.OrderWhereInput = {};
  if (status) where.statusKey = status;
  if (q) {
    const number = Number(q.replace(/^tq-?/i, ''));
    where.OR = [
      ...(Number.isInteger(number) && number > 0 ? [{ number }] : []),
      { productTitle: { contains: q, mode: 'insensitive' } },
      { productDescription: { contains: q, mode: 'insensitive' } },
      { user: { name: { contains: q, mode: 'insensitive' } } },
      { user: { email: { contains: q, mode: 'insensitive' } } },
      { user: { phone: { contains: q } } },
    ];
  }

  const [orders, count, statuses, marketplaces] = await Promise.all([
    db.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        status: true,
        user: { select: { name: true, email: true } },
        quotations: { where: { status: { in: ['SENT', 'ACCEPTED'] } }, orderBy: { version: 'desc' }, take: 1, select: { totalAzn: true } },
      },
    }),
    db.order.count({ where }),
    db.orderStatus.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.marketplace.findMany({ select: { key: true, name: true } }),
  ]);
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const pageHref = (p: number) => `/admin/orders?${new URLSearchParams({ ...(q && { q }), ...(status && { status }), page: String(p) })}`;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t.title}</h1>
        <span className="tabular text-sm text-muted">{count}</span>
      </div>

      <form className="mt-6 grid gap-3 sm:grid-cols-[1fr_14rem_auto]" action="/admin/orders">
        <Input name="q" defaultValue={q} placeholder={t.searchPh} aria-label={m.common.search} />
        <Select name="status" defaultValue={status} aria-label={t.status}>
          <option value="">{t.status}: {m.common.all}</option>
          {statuses.map((s) => (
            <option key={s.key} value={s.key}>{statusLabel(s, locale)}</option>
          ))}
        </Select>
        <button className={buttonClass('primary')}>{t.filter}</button>
      </form>

      <Card className="mt-5 overflow-hidden">
        {orders.length === 0 ? (
          <EmptyState title={t.empty} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line text-[12px] tracking-wide text-muted uppercase">
                <tr>
                  {[t.order, t.customer, t.product, t.source, t.status, t.total, t.created].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium first:pl-5 last:pr-5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {orders.map((o) => (
                  <tr key={o.id} className="relative hover:bg-paper/60">
                    <td className="tabular py-3.5 pr-4 pl-5 font-medium whitespace-nowrap">
                      <Link href={`/admin/orders/${o.id}`} className="after:absolute after:inset-0">{orderNo(o.number)}</Link>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="block max-w-40 truncate">{o.user.name}</span>
                      <span className="block max-w-40 truncate text-[12px] text-muted">{o.user.email}</span>
                    </td>
                    <td className="px-4 py-3.5"><span className="block max-w-56 truncate">{o.productTitle ?? o.productDescription ?? '—'}</span></td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-ink-soft">{marketplaces.find((x) => x.key === o.sourceMarketplace)?.name ?? (o.method === 'IMAGE' ? m.dash.photoRequest : m.detail.unknownSource)}</td>
                    <td className="px-4 py-3.5"><StatusBadge statusKey={o.statusKey} label={statusLabel(o.status, locale)} /></td>
                    <td className="tabular px-4 py-3.5 whitespace-nowrap">{o.quotations[0] ? formatAzn(num(o.quotations[0].totalAzn), locale) : '—'}</td>
                    <td className="tabular py-3.5 pr-5 pl-4 whitespace-nowrap text-muted">{formatDate(o.createdAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {pages > 1 && (
        <nav className="tabular mt-5 flex items-center justify-between text-sm" aria-label="Pagination">
          {page > 1 ? <Link href={pageHref(page - 1)} className={buttonClass('secondary', 'sm')}>←</Link> : <span />}
          <span className="text-muted">{page} / {pages}</span>
          {page < pages ? <Link href={pageHref(page + 1)} className={buttonClass('secondary', 'sm')}>→</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
