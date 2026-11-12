import type { Prisma } from '@prisma/client';
import Link from 'next/link';
import { Badge, buttonClass, Card, EmptyState, Input } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { db } from '@/lib/db';
import { formatAzn, formatDate } from '@/lib/format';
import { num } from '@/lib/orders';

export default async function AdminCustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const [{ m, locale }, params] = await Promise.all([getI18n(), searchParams]);
  const t = m.admin.customers;
  const q = (params.q ?? '').trim().slice(0, 100);

  const where: Prisma.UserWhereInput = { role: 'CUSTOMER' };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
    ];
  }

  const customers = await db.user.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100, include: { _count: { select: { orders: true } } } });
  const paid = await db.payment.groupBy({
    by: ['orderId'],
    _sum: { amount: true },
    where: { status: 'CONFIRMED', order: { userId: { in: customers.map((c) => c.id) } } },
  });
  const orderOwners = await db.order.findMany({ where: { id: { in: paid.map((p) => p.orderId) } }, select: { id: true, userId: true } });
  const paidByUser = new Map<string, number>();
  for (const p of paid) {
    const owner = orderOwners.find((o) => o.id === p.orderId)?.userId;
    if (owner) paidByUser.set(owner, (paidByUser.get(owner) ?? 0) + num(p._sum.amount));
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t.title}</h1>
      <form className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]" action="/admin/customers">
        <Input name="q" defaultValue={q} placeholder={t.searchPh} aria-label={m.common.search} />
        <button className={buttonClass('primary')}>{m.common.search}</button>
      </form>

      <Card className="mt-5 overflow-hidden">
        {customers.length === 0 ? (
          <EmptyState title={t.empty} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-[12px] tracking-wide text-muted uppercase">
                <tr>
                  {[t.name, t.contact, t.orders, t.paid, t.joined].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium first:pl-5 last:pr-5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {customers.map((c) => (
                  <tr key={c.id} className="relative hover:bg-paper/60">
                    <td className="py-3.5 pr-4 pl-5 font-medium">
                      <Link href={`/admin/customers/${c.id}`} className="after:absolute after:inset-0">{c.name}</Link>
                      {c.accountType === 'BUSINESS' && <Badge tone="info" className="ml-2">{t.business}</Badge>}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="block">{c.email}</span>
                      <span className="tabular block text-[12px] text-muted">{c.phone}</span>
                    </td>
                    <td className="tabular px-4 py-3.5">{c._count.orders}</td>
                    <td className="tabular px-4 py-3.5 whitespace-nowrap">{formatAzn(paidByUser.get(c.id) ?? 0, locale)}</td>
                    <td className="tabular py-3.5 pr-5 pl-4 whitespace-nowrap text-muted">{formatDate(c.createdAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
