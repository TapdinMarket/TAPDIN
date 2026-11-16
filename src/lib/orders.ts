import 'server-only';
import type { Prisma } from '@prisma/client';
import { db } from './db';

/** System status keys that drive business logic. Labels/order are configurable in the admin panel. */
export const STATUS = {
  REQUEST_RECEIVED: 'request_received',
  PRICE_CALCULATION: 'price_calculation',
  AWAITING_APPROVAL: 'awaiting_approval',
  AWAITING_PAYMENT: 'awaiting_payment',
  PURCHASE_CONFIRMED: 'purchase_confirmed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

/** Statuses that count as "pending request" (not yet a paying order). */
export const PENDING_STATUSES: string[] = [
  STATUS.REQUEST_RECEIVED,
  STATUS.PRICE_CALCULATION,
  STATUS.AWAITING_APPROVAL,
  STATUS.AWAITING_PAYMENT,
];

/** Event codes rendered through the i18n dictionary (`events.*`). Free text is shown as-is. */
export const EVENT = {
  CREATED: 'created',
  STATUS: 'status_changed',
  QUOTE_SENT: 'quote_sent',
  QUOTE_ACCEPTED: 'quote_accepted',
  QUOTE_REJECTED: 'quote_rejected',
  QUOTE_EXPIRED: 'quote_expired',
  PAYMENT_REPORTED: 'payment_reported',
  PAYMENT_CONFIRMED: 'payment_confirmed',
  PAYMENT_FAILED: 'payment_failed',
  TRACKING_ADDED: 'tracking_added',
  INSPECTION_ADDED: 'inspection_added',
  CHARGE_ADDED: 'charge_added',
} as const;

type Tx = Prisma.TransactionClient;

export const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));

export const orderNo = (n: number) => `TD-${String(n).padStart(5, '0')}`;

export async function addEvent(
  tx: Tx,
  orderId: string,
  description: string,
  opts: { status?: string; actorId?: string | null; visible?: boolean } = {},
) {
  await tx.orderEvent.create({
    data: {
      orderId,
      description,
      status: opts.status,
      actorId: opts.actorId ?? null,
      visible: opts.visible ?? true,
    },
  });
}

export async function setOrderStatus(tx: Tx, orderId: string, statusKey: string, actorId?: string | null) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { statusKey: true } });
  if (order.statusKey === statusKey) return;
  await tx.order.update({ where: { id: orderId }, data: { statusKey } });
  await addEvent(tx, orderId, EVENT.STATUS, { status: statusKey, actorId });
}

/** Lazily expire quotations whose validity has passed. Called whenever an order is read. */
export async function syncQuotationExpiry(orderId: string) {
  const now = new Date();
  await db.$transaction(async (tx) => {
    const expired = await tx.quotation.updateMany({
      where: { orderId, status: 'SENT', expiresAt: { lt: now } },
      data: { status: 'EXPIRED', decidedAt: now },
    });
    if (expired.count === 0) return;
    await addEvent(tx, orderId, EVENT.QUOTE_EXPIRED);
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { statusKey: true } });
    if (order.statusKey === STATUS.AWAITING_APPROVAL) await setOrderStatus(tx, orderId, STATUS.PRICE_CALCULATION);
  });
}

export type Financials = {
  /** Total of the accepted (confirmed) quotation, 0 when none. */
  quotedAzn: number;
  /** Additional charges that are due (not waived). */
  chargesAzn: number;
  /** Staff-confirmed payments only. */
  paidAzn: number;
  /** Payments reported but not yet confirmed. */
  pendingAzn: number;
  balanceAzn: number;
};

export function computeFinancials(order: {
  quotations: { status: string; totalAzn: Prisma.Decimal }[];
  charges: { status: string; amountAzn: Prisma.Decimal }[];
  payments: { status: string; amount: Prisma.Decimal }[];
}): Financials {
  const accepted = order.quotations.find((q) => q.status === 'ACCEPTED');
  const quoted = Math.round(num(accepted?.totalAzn) * 100);
  const charges = order.charges.filter((c) => c.status === 'DUE').reduce((s, c) => s + Math.round(num(c.amountAzn) * 100), 0);
  const paid = order.payments.filter((p) => p.status === 'CONFIRMED').reduce((s, p) => s + Math.round(num(p.amount) * 100), 0);
  const pending = order.payments.filter((p) => p.status === 'PENDING').reduce((s, p) => s + Math.round(num(p.amount) * 100), 0);
  return {
    quotedAzn: quoted / 100,
    chargesAzn: charges / 100,
    paidAzn: paid / 100,
    pendingAzn: pending / 100,
    balanceAzn: Math.max(0, quoted + charges - paid) / 100,
  };
}

/** When the accepted quotation is fully covered by confirmed payments, move the order forward. */
export async function advanceAfterPayment(tx: Tx, orderId: string, actorId?: string | null) {
  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { quotations: true, payments: true, charges: true },
  });
  if (order.statusKey !== STATUS.AWAITING_PAYMENT) return;
  const f = computeFinancials(order);
  if (f.quotedAzn > 0 && f.paidAzn >= f.quotedAzn) {
    await setOrderStatus(tx, orderId, STATUS.PURCHASE_CONFIRMED, actorId);
  }
}
