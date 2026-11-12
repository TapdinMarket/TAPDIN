'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/components/action-form';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getI18n } from '@/i18n/server';
import { getPaymentProvider } from '@/lib/integrations';
import { addEvent, computeFinancials, EVENT, setOrderStatus, STATUS, syncQuotationExpiry } from '@/lib/orders';

async function decideQuotation(formData: FormData, decision: 'ACCEPTED' | 'REJECTED'): Promise<ActionState> {
  const { m } = await getI18n();
  const user = await getCurrentUser();
  const quotationId = formData.get('quotationId');
  if (!user || typeof quotationId !== 'string') return { ok: false, message: m.common.error };

  // Ownership is part of the query: another customer's quotation is simply "not found".
  const quotation = await db.quotation.findFirst({
    where: { id: quotationId, order: { userId: user.id } },
    select: { id: true, orderId: true, totalAzn: true },
  });
  if (!quotation) return { ok: false, message: m.quote.gone };
  await syncQuotationExpiry(quotation.orderId);

  const done = await db.$transaction(async (tx) => {
    // Conditional update makes the decision idempotent and race-safe.
    const updated = await tx.quotation.updateMany({
      where: { id: quotation.id, status: 'SENT', expiresAt: { gt: new Date() } },
      data: { status: decision, decidedAt: new Date() },
    });
    if (updated.count !== 1) return false;
    if (decision === 'ACCEPTED') {
      await addEvent(tx, quotation.orderId, EVENT.QUOTE_ACCEPTED, { actorId: user.id });
      await setOrderStatus(tx, quotation.orderId, STATUS.AWAITING_PAYMENT, user.id);
    } else {
      await addEvent(tx, quotation.orderId, EVENT.QUOTE_REJECTED, { actorId: user.id });
      await setOrderStatus(tx, quotation.orderId, STATUS.PRICE_CALCULATION, user.id);
    }
    return true;
  });
  if (!done) return { ok: false, message: m.quote.gone };

  if (decision === 'ACCEPTED') {
    // Payment port. The manual provider returns no redirect: the customer follows the payment instructions.
    await getPaymentProvider().createCheckout({ orderId: quotation.orderId, amountAzn: Number(quotation.totalAzn) });
  }

  revalidatePath(`/dashboard/orders/${quotation.orderId}`);
  revalidatePath('/dashboard');
  return { ok: true };
}

export async function acceptQuotationAction(_: ActionState, formData: FormData) {
  return decideQuotation(formData, 'ACCEPTED');
}

export async function rejectQuotationAction(_: ActionState, formData: FormData) {
  return decideQuotation(formData, 'REJECTED');
}

const reportSchema = z.object({
  orderId: z.string().min(1),
  amount: z.coerce.number().positive().max(1_000_000),
  method: z.enum(['BANK_TRANSFER', 'CARD_TO_CARD', 'CASH']),
  reference: z.string().trim().max(120),
});

/**
 * The customer tells us they paid. This only creates a PENDING record —
 * money is never treated as received until staff confirm it.
 */
export async function reportPaymentAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { m } = await getI18n();
  const user = await getCurrentUser();
  const parsed = reportSchema.safeParse(Object.fromEntries(formData));
  if (!user || !parsed.success) return { ok: false, message: m.common.invalid };

  const order = await db.order.findFirst({
    where: { id: parsed.data.orderId, userId: user.id },
    include: { quotations: true, payments: true, charges: true },
  });
  if (!order) return { ok: false, message: m.common.error };

  const accepted = order.quotations.find((q) => q.status === 'ACCEPTED');
  const f = computeFinancials(order);
  const amount = Math.round(parsed.data.amount * 100) / 100;
  const openPending = order.payments.filter((p) => p.status === 'PENDING').length;
  if (!accepted || f.balanceAzn <= 0 || amount > f.balanceAzn || openPending >= 3) {
    return { ok: false, message: m.common.invalid };
  }

  await db.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        orderId: order.id,
        quotationId: accepted.id,
        amount,
        status: 'PENDING',
        paymentMethod: parsed.data.method,
        reference: parsed.data.reference || null,
      },
    });
    await addEvent(tx, order.id, EVENT.PAYMENT_REPORTED, { actorId: user.id });
  });

  revalidatePath(`/dashboard/orders/${order.id}`);
  return { ok: true, message: m.payment.reported };
}
