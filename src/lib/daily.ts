import 'server-only';
import { db } from './db';
import { fetchCbarRates } from './fx/cbar';
import { notifyOrder } from './notifications';
import { DELAY_STATUSES } from './notifications/messages';
import { computeFinancials, STATUS } from './orders';

const HOUR = 3_600_000;

/**
 * Updates every currency configured in Settings with today's official CBAR rate.
 * Currencies CBAR does not publish keep their manual rate. Quotations already sent keep their own locked rate.
 */
export async function refreshRatesFromCbar() {
  const { date, rates } = await fetchCbarRates();
  const configured = await db.exchangeRate.findMany();
  const updated: string[] = [];
  const missing: string[] = [];
  for (const row of configured) {
    const rate = rates[row.currency];
    if (!rate) {
      missing.push(row.currency);
      continue;
    }
    await db.exchangeRate.update({ where: { currency: row.currency }, data: { rateToAzn: rate, source: 'CBAR' } });
    updated.push(row.currency);
  }
  return { date, updated, missing };
}

/** Sends each reminder once: "quotation expires within 24 h" and "accepted 48 h ago, still unpaid". */
export async function sendReminders(now = new Date()) {
  const sent: string[] = [];
  const once = async (orderId: string, key: string, run: () => Promise<void>) => {
    if (await db.notification.findFirst({ where: { orderId, event: key }, select: { id: true } })) return;
    await run();
    sent.push(key);
  };

  const expiring = await db.quotation.findMany({
    where: { status: 'SENT', expiresAt: { gt: now, lt: new Date(now.getTime() + 24 * HOUR) }, order: { statusKey: STATUS.AWAITING_APPROVAL } },
    select: { id: true, orderId: true },
  });
  for (const q of expiring) await once(q.orderId, `quote_expiring:${q.id}`, () => notifyOrder(q.orderId, 'quote_expiring', { logKey: `quote_expiring:${q.id}` }));

  const unpaid = await db.order.findMany({
    where: { statusKey: STATUS.AWAITING_PAYMENT, quotations: { some: { status: 'ACCEPTED', decidedAt: { lt: new Date(now.getTime() - 48 * HOUR) } } } },
    include: { quotations: true, payments: true, charges: true },
  });
  for (const order of unpaid) {
    const accepted = order.quotations.find((q) => q.status === 'ACCEPTED')!;
    const balance = computeFinancials(order).balanceAzn;
    if (balance <= 0) continue;
    await once(order.id, `payment_reminder:${accepted.id}`, () => notifyOrder(order.id, 'payment_reminder', { amountAzn: balance, logKey: `payment_reminder:${accepted.id}` }));
  }
  return sent;
}

export type AttentionRow = { id: string; number: number; customer: string; since: Date };

/** What staff should look at today. Shown on the admin overview. */
export async function attentionItems(now = new Date()) {
  const include = { user: { select: { name: true } } } as const;
  const row = (o: { id: string; number: number; user: { name: string } }, since: Date): AttentionRow => ({ id: o.id, number: o.number, customer: o.user.name, since });

  const [noQuote, expiring, unpaid, reported, delayed, decisions] = await Promise.all([
    db.order.findMany({
      where: { statusKey: { in: [STATUS.REQUEST_RECEIVED, STATUS.PRICE_CALCULATION] }, createdAt: { lt: new Date(now.getTime() - 24 * HOUR) }, quotations: { none: { status: { in: ['SENT', 'ACCEPTED'] } } } },
      include,
      orderBy: { createdAt: 'asc' },
      take: 20,
    }),
    db.order.findMany({
      where: { statusKey: STATUS.AWAITING_APPROVAL, quotations: { some: { status: 'SENT', expiresAt: { gt: now, lt: new Date(now.getTime() + 24 * HOUR) } } } },
      include: { ...include, quotations: { where: { status: 'SENT' }, select: { expiresAt: true } } },
      take: 20,
    }),
    db.order.findMany({
      where: { statusKey: STATUS.AWAITING_PAYMENT, quotations: { some: { status: 'ACCEPTED', decidedAt: { lt: new Date(now.getTime() - 48 * HOUR) } } } },
      include: { ...include, quotations: { where: { status: 'ACCEPTED' }, select: { decidedAt: true } } },
      take: 20,
    }),
    db.order.findMany({
      where: { payments: { some: { status: 'PENDING' } } },
      include: { ...include, payments: { where: { status: 'PENDING' }, select: { createdAt: true } } },
      take: 20,
    }),
    db.order.findMany({ where: { statusKey: { in: [...DELAY_STATUSES] } }, include, orderBy: { updatedAt: 'asc' }, take: 20 }),
    db.order.findMany({ where: { items: { some: { unavailable: true, resolution: 'PENDING' } } }, include, orderBy: { updatedAt: 'asc' }, take: 20 }),
  ]);

  return {
    noQuote: noQuote.map((o) => row(o, o.createdAt)),
    expiring: expiring.map((o) => row(o, o.quotations[0]?.expiresAt ?? now)),
    unpaid: unpaid.map((o) => row(o, o.quotations[0]?.decidedAt ?? o.updatedAt)),
    reported: reported.map((o) => row(o, o.payments[0]?.createdAt ?? o.updatedAt)),
    delayed: delayed.map((o) => row(o, o.updatedAt)),
    decisions: decisions.map((o) => row(o, o.updatedAt)),
  };
}
