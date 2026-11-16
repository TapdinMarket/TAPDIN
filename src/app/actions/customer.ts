'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/components/action-form';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getI18n } from '@/i18n/server';
import { getPaymentProvider } from '@/lib/integrations';
import { addEvent, computeFinancials, EVENT, setOrderStatus, STATUS, syncQuotationExpiry } from '@/lib/orders';
import { detectMarketplace, parseHttpUrl } from '@/lib/marketplaces';
import { MAX_IMAGES_PER_ORDER, storeUpload, validateUpload } from '@/lib/uploads';

async function decideQuotation(formData: FormData, decision: 'ACCEPTED' | 'REJECTED'): Promise<ActionState> {
  const { m } = await getI18n();
  const user = await getCurrentUser();
  const quotationId = formData.get('quotationId');
  const insured = formData.get('insurance') === 'on';
  if (!user || typeof quotationId !== 'string') return { ok: false, message: m.common.error };

  // Ownership is part of the query: another customer's quotation is simply "not found".
  const quotation = await db.quotation.findFirst({
    where: { id: quotationId, order: { userId: user.id } },
    select: { id: true, orderId: true, totalAzn: true, insuranceAzn: true },
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
      // Accepting the quotation answers any open out-of-stock question: the order continues without those items.
      await tx.orderItem.updateMany({ where: { orderId: quotation.orderId, unavailable: true, resolution: 'PENDING' }, data: { resolution: 'REMOVED' } });
      // Optional insurance: becomes a separate charge, so the payment block shows it and the balance includes it.
      const insurance = Number(quotation.insuranceAzn);
      if (insured && insurance > 0) {
        await tx.quotation.update({ where: { id: quotation.id }, data: { insured: true } });
        await tx.additionalCharge.create({ data: { orderId: quotation.orderId, description: m.quote.insuranceCharge, amountAzn: insurance } });
      }
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

/** Notification preferences of the signed-in customer. WhatsApp is opt-in. */
export async function updateNotifyPrefsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { m } = await getI18n();
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: m.common.error };
  await db.user.update({
    where: { id: user.id },
    data: { notifyEmail: formData.get('notifyEmail') === 'on', notifyWhatsApp: formData.get('notifyWhatsApp') === 'on' },
  });
  revalidatePath('/dashboard');
  return { ok: true, message: m.common.saved };
}

// ── Out-of-stock items: the customer decides ─────────────────────

type Owned = { id: string; orderId: string; position: number };

/** An out-of-stock item of the signed-in customer that still waits for a decision, on an unpaid order. */
async function pendingItem(itemId: unknown, userId: string): Promise<Owned | null> {
  if (typeof itemId !== 'string') return null;
  return db.orderItem.findFirst({
    where: {
      id: itemId,
      unavailable: true,
      resolution: 'PENDING',
      order: { userId, payments: { none: { status: { in: ['CONFIRMED', 'PENDING'] } } } },
    },
    select: { id: true, orderId: true, position: true },
  });
}

/** "Continue without this item." */
export async function removeUnavailableItemAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { m } = await getI18n();
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: m.common.error };
  const item = await pendingItem(formData.get('itemId'), user.id);
  if (!item) return { ok: false, message: m.common.error };
  await db.$transaction(async (tx) => {
    await tx.orderItem.update({ where: { id: item.id }, data: { resolution: 'REMOVED' } });
    await addEvent(tx, item.orderId, 'item_removed', { actorId: user.id });
  });
  revalidatePath(`/dashboard/orders/${item.orderId}`);
  return { ok: true };
}

const replaceSchema = z.object({
  method: z.enum(['URL', 'IMAGE']),
  sourceUrl: z.string().trim().max(2000),
  title: z.string().trim().max(300),
  description: z.string().trim().max(2000),
  quantity: z.coerce.number().int().min(1).max(10_000),
  sizeColor: z.string().trim().max(200),
});

/**
 * "Replace it": a new item (link or photo) takes the out-of-stock item's place and starts its own life cycle —
 * the order goes back to price calculation and staff quote again. Same region rule as a new order.
 */
export async function replaceUnavailableItemAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { m } = await getI18n();
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: m.common.error };
  const item = await pendingItem(formData.get('itemId'), user.id);
  if (!item) return { ok: false, message: m.common.error };

  const parsed = replaceSchema.safeParse({
    method: formData.get('method'),
    sourceUrl: formData.get('sourceUrl') ?? '',
    title: formData.get('title') ?? '',
    description: formData.get('description') ?? '',
    quantity: formData.get('quantity') ?? '1',
    sizeColor: formData.get('sizeColor') ?? '',
  });
  if (!parsed.success) return { ok: false, message: m.common.invalid };
  const d = parsed.data;

  const files = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0).slice(0, MAX_IMAGES_PER_ORDER);
  const uploads = [];
  for (const file of files) {
    const r = await validateUpload(file, { image: true, video: false });
    if (!r.ok) return { ok: false, message: r.error === 'size' ? m.order.fileSize : m.order.fileType };
    uploads.push(r);
  }

  let marketplace: string | null = null;
  if (d.method === 'URL') {
    const url = parseHttpUrl(d.sourceUrl);
    if (!url || d.title.length < 2) return { ok: false, message: d.title.length < 2 ? m.order.needTitle : m.order.invalidUrl };
    const order = await db.order.findUniqueOrThrow({ where: { id: item.orderId }, select: { regionKey: true } });
    const found = detectMarketplace(url.toString(), await db.marketplace.findMany({ where: { enabled: true } }));
    // One order = one warehouse: a store from another region cannot replace an item here.
    if (found && order.regionKey && found.regionKey !== order.regionKey) return { ok: false, message: m.order.cart.mixedServer };
    marketplace = found?.key ?? null;
  } else if (d.description.length < 3 || uploads.length === 0) {
    return { ok: false, message: uploads.length === 0 ? m.order.needImage : m.order.needDescription };
  }

  const created = await db.$transaction(async (tx) => {
    const next = await tx.orderItem.create({
      data: {
        orderId: item.orderId,
        position: item.position,
        method: d.method,
        sourceUrl: d.method === 'URL' ? parseHttpUrl(d.sourceUrl)!.toString() : null,
        sourceMarketplace: marketplace,
        title: d.method === 'URL' ? d.title : null,
        description: d.method === 'IMAGE' ? d.description : null,
        quantity: d.quantity,
        sizeColor: d.sizeColor || null,
      },
    });
    await tx.orderItem.update({ where: { id: item.id }, data: { resolution: 'REPLACED' } });
    await tx.quotation.updateMany({ where: { orderId: item.orderId, status: 'SENT' }, data: { status: 'SUPERSEDED', decidedAt: new Date() } });
    await addEvent(tx, item.orderId, 'item_replaced', { actorId: user.id });
    await setOrderStatus(tx, item.orderId, STATUS.PRICE_CALCULATION, user.id);
    return next;
  });

  for (const upload of uploads) {
    const key = await storeUpload(item.orderId, upload.buffer, upload.type);
    await db.orderMedia.create({ data: { orderId: item.orderId, itemId: created.id, storageKey: key, mimeType: upload.type.mime, sizeBytes: upload.buffer.length, kind: 'CUSTOMER_REFERENCE' } });
  }
  revalidatePath(`/dashboard/orders/${item.orderId}`);
  return { ok: true, message: m.detail.replaced };
}
