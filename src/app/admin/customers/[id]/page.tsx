import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { saveCustomerAction } from '@/app/actions/admin';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Card, CardHeader, EmptyState, Field, Row, Select, StatusBadge, Textarea } from '@/components/ui';
import { statusLabel } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { db } from '@/lib/db';
import { formatAzn, formatDate } from '@/lib/format';
import { num, orderNo, STATUS } from '@/lib/orders';

export default async function AdminCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ m, locale }, { id }] = await Promise.all([getI18n(), params]);
  const t = m.admin.customers;

  const customer = await db.user.findFirst({
    where: { id, role: 'CUSTOMER' },
    include: {
      orders: {
        orderBy: { createdAt: 'desc' },
        include: { status: true, payments: { where: { status: 'CONFIRMED' }, select: { amount: true } } },
      },
    },
  });
  if (!customer) notFound();

  const paid = customer.orders.reduce((sum, o) => sum + o.payments.reduce((s, p) => s + num(p.amount), 0), 0);
  const completed = customer.orders.filter((o) => o.statusKey === STATUS.COMPLETED).length;

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/customers" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        {t.title}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">{customer.name}</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.3fr] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader title={t.profile} />
            <dl className="divide-y divide-line px-5 py-2 sm:px-6">
              <Row label={m.auth.email}><a className="underline underline-offset-4" href={`mailto:${customer.email}`}>{customer.email}</a></Row>
              <Row label={m.auth.phone}>{customer.phone ? <a className="tabular underline underline-offset-4" href={`tel:${customer.phone}`}>{customer.phone}</a> : '—'}</Row>
              <Row label={t.joined}>{formatDate(customer.createdAt, locale)}</Row>
            </dl>
          </Card>
          <Card>
            <CardHeader title={t.stats} />
            <dl className="tabular divide-y divide-line px-5 py-2 sm:px-6">
              <Row label={t.orders}>{customer.orders.length}</Row>
              <Row label={t.completed}>{completed}</Row>
              <Row label={t.paid}>{formatAzn(paid, locale)}</Row>
            </dl>
          </Card>
          <Card>
            <CardHeader title={t.notes} />
            <ActionForm action={saveCustomerAction} className="space-y-4 p-5 sm:p-6">
              <input type="hidden" name="userId" value={customer.id} />
              <Field label={t.accountType}>
                <Select name="accountType" defaultValue={customer.accountType}>
                  <option value="PERSONAL">{t.personal}</option>
                  <option value="BUSINESS">{t.business}</option>
                </Select>
              </Field>
              <Textarea name="adminNotes" defaultValue={customer.adminNotes ?? ''} placeholder={t.notesPh} rows={5} aria-label={t.notes} />
              <SubmitButton size="sm">{m.common.save}</SubmitButton>
            </ActionForm>
          </Card>
        </div>

        <Card>
          <CardHeader title={t.history} />
          {customer.orders.length === 0 ? (
            <EmptyState title={m.admin.orders.empty} />
          ) : (
            <ul className="divide-y divide-line">
              {customer.orders.map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 text-sm hover:bg-paper/60 sm:px-6">
                    <span className="min-w-0">
                      <span className="tabular mr-3 text-muted">{orderNo(o.number)}</span>
                      <span className="font-medium">{o.productTitle ?? o.productDescription ?? '—'}</span>
                      <span className="tabular block text-[12px] text-muted">{formatDate(o.createdAt, locale)}</span>
                    </span>
                    <StatusBadge statusKey={o.statusKey} label={statusLabel(o.status, locale)} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
