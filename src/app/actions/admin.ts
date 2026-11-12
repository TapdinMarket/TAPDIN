'use server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/components/action-form';
import { getCurrentUser, isStaff, type SessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getI18n } from '@/i18n/server';
import { addEvent, advanceAfterPayment, EVENT, setOrderStatus, STATUS } from '@/lib/orders';
import { calculateQuote } from '@/lib/pricing/engine';
import { saveSetting, settingSchemas } from '@/lib/settings';
import { storage } from '@/lib/storage';

// ── Guards ───────────────────────────────────────────────────────
// Every action re-checks the session: server actions are public HTTP endpoints.

type Handler<T> = (data: T, user: SessionUser) => Promise<ActionState | void>;

function guarded<S extends z.ZodType>(role: 'staff' | 'admin', schema: S, handler: Handler<z.infer<S>>) {
  return async (_: ActionState, formData: FormData): Promise<ActionState> => {
    const { m } = await getI18n();
    const user = await getCurrentUser();
    if (!user || !isStaff(user) || (role === 'admin' && user.role !== 'ADMIN')) return { ok: false, message: m.admin.settings.adminOnly };
    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, message: m.common.invalid };
    try {
      const result = await handler(parsed.data, user);
      revalidatePath('/', 'layout');
      if (result && !result.ok) return { ok: false, message: result.message ?? m.common.invalid };
      return result ?? { ok: true, message: m.common.saved };
    } catch (error) {
      console.error('Admin action failed', error);
      return { ok: false, message: m.common.error };
    }
  };
}

const id = z.string().min(1).max(40);
const money = z.coerce.number().min(0).max(10_000_000);
const text = (max: number) => z.string().trim().max(max);
const checkbox = z.preprocess((v) => v === 'on' || v === 'true', z.boolean());
const key = z.string().trim().regex(/^[A-Za-z0-9_]{1,30}$/);

// ── Orders ───────────────────────────────────────────────────────

export const updateStatusAction = guarded('staff', z.object({ orderId: id, statusKey: id }), async (d, user) => {
  const status = await db.orderStatus.findFirst({ where: { key: d.statusKey, active: true } });
  if (!status) return { ok: false };
  await db.$transaction((tx) => setOrderStatus(tx, d.orderId, d.statusKey, user.id));
});

export const updateClassificationAction = guarded(
  'staff',
  z.object({ orderId: id, regionKey: text(10), marketplace: text(30), type: z.enum(['PERSONAL', 'B2B']) }),
  async (d) => {
    const [region, marketplace] = await Promise.all([
      d.regionKey ? db.region.findUnique({ where: { key: d.regionKey } }) : null,
      d.marketplace ? db.marketplace.findUnique({ where: { key: d.marketplace } }) : null,
    ]);
    await db.order.update({
      where: { id: d.orderId },
      data: { regionKey: region?.key ?? null, sourceMarketplace: marketplace?.key ?? null, type: d.type },
    });
  },
);

export const addNoteAction = guarded('staff', z.object({ orderId: id, body: text(4000).min(1) }), async (d, user) => {
  await db.internalNote.create({ data: { orderId: d.orderId, authorId: user.id, body: d.body } });
});

// ── Quotations ───────────────────────────────────────────────────

const quoteSchema = z.object({
  orderId: id,
  currency: z.string().regex(/^[A-Z]{3}$/),
  exchangeRate: z.coerce.number().positive().max(100_000),
  unitPrice: z.coerce.number().positive().max(10_000_000),
  quantity: z.coerce.number().int().min(1).max(10_000),
  domesticShipping: money,
  weightKg: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.coerce.number().min(0).max(10_000).optional()),
  internationalShippingAzn: money,
  commissionPercent: z.coerce.number().min(0).max(100),
  commissionBasis: z.enum(['PRODUCT', 'PRODUCT_AND_DOMESTIC', 'SUBTOTAL']),
  minCommissionAzn: money,
  sourcingFeeAzn: money,
  customsChargesAzn: money,
  otherExpensesAzn: money,
  noteToCustomer: text(1000),
  validDays: z.coerce.number().int().min(1).max(60),
});

/**
 * Creates a quotation. The client only sends inputs; every AZN amount and the total
 * are computed here by the pricing engine. A client-supplied total is never read.
 */
export const sendQuotationAction = guarded('staff', quoteSchema, async (d, user) => {
  const order = await db.order.findUnique({ where: { id: d.orderId }, include: { quotations: { select: { version: true, status: true } } } });
  const closed: string[] = [STATUS.CANCELLED, STATUS.COMPLETED];
  if (!order || closed.includes(order.statusKey) || order.quotations.some((q) => q.status === 'ACCEPTED')) return { ok: false };
  if (!(await db.exchangeRate.findUnique({ where: { currency: d.currency } }))) return { ok: false };

  const b = calculateQuote(d);
  const version = Math.max(0, ...order.quotations.map((q) => q.version)) + 1;

  await db.$transaction(async (tx) => {
    await tx.quotation.updateMany({ where: { orderId: order.id, status: 'SENT' }, data: { status: 'SUPERSEDED', decidedAt: new Date() } });
    await tx.quotation.create({
      data: {
        orderId: order.id,
        version,
        currency: d.currency,
        exchangeRate: d.exchangeRate,
        unitPrice: d.unitPrice,
        quantity: d.quantity,
        domesticShipping: d.domesticShipping,
        weightKg: d.weightKg ?? null,
        commissionPercent: d.commissionPercent,
        commissionBasis: d.commissionBasis,
        minCommissionAzn: d.minCommissionAzn,
        productCost: b.productCost,
        productCostAzn: b.productCostAzn,
        domesticShippingAzn: b.domesticShippingAzn,
        internationalShippingAzn: b.internationalShippingAzn,
        serviceFeeAzn: b.serviceFeeAzn,
        sourcingFeeAzn: b.sourcingFeeAzn,
        customsChargesAzn: b.customsChargesAzn,
        otherExpensesAzn: b.otherExpensesAzn,
        totalAzn: b.totalAzn,
        noteToCustomer: d.noteToCustomer || null,
        expiresAt: new Date(Date.now() + d.validDays * 86_400_000),
      },
    });
    await addEvent(tx, order.id, EVENT.QUOTE_SENT, { actorId: user.id });
    await setOrderStatus(tx, order.id, STATUS.AWAITING_APPROVAL, user.id);
  });
});

// ── Payments & charges ───────────────────────────────────────────

export const recordPaymentAction = guarded(
  'staff',
  z.object({ orderId: id, amount: z.coerce.number().positive().max(10_000_000), method: z.enum(['BANK_TRANSFER', 'CARD_TO_CARD', 'CASH', 'ONLINE']), reference: text(120) }),
  async (d, user) => {
    const accepted = await db.quotation.findFirst({ where: { orderId: d.orderId, status: 'ACCEPTED' }, select: { id: true } });
    if (!accepted) return { ok: false };
    await db.$transaction(async (tx) => {
      await tx.payment.create({
        data: { orderId: d.orderId, quotationId: accepted.id, amount: d.amount, status: 'CONFIRMED', paymentMethod: d.method, reference: d.reference || null, confirmedAt: new Date() },
      });
      await addEvent(tx, d.orderId, EVENT.PAYMENT_CONFIRMED, { actorId: user.id });
      await advanceAfterPayment(tx, d.orderId, user.id);
    });
  },
);

export const setPaymentStatusAction = guarded('staff', z.object({ paymentId: id, status: z.enum(['CONFIRMED', 'FAILED', 'REFUNDED']) }), async (d, user) => {
  await db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: d.paymentId } });
    if (!payment) return;
    // Allowed transitions: PENDING → CONFIRMED | FAILED, CONFIRMED → REFUNDED.
    const allowed = (payment.status === 'PENDING' && d.status !== 'REFUNDED') || (payment.status === 'CONFIRMED' && d.status === 'REFUNDED');
    if (!allowed) return;
    await tx.payment.update({ where: { id: payment.id }, data: { status: d.status, confirmedAt: d.status === 'CONFIRMED' ? new Date() : payment.confirmedAt } });
    if (d.status === 'CONFIRMED') {
      await addEvent(tx, payment.orderId, EVENT.PAYMENT_CONFIRMED, { actorId: user.id });
      await advanceAfterPayment(tx, payment.orderId, user.id);
    } else if (d.status === 'FAILED') {
      await addEvent(tx, payment.orderId, EVENT.PAYMENT_FAILED, { actorId: user.id });
    } else {
      await addEvent(tx, payment.orderId, 'payment_refunded', { actorId: user.id, visible: false });
    }
  });
});

export const addChargeAction = guarded('staff', z.object({ orderId: id, description: text(300).min(2), amountAzn: z.coerce.number().positive().max(1_000_000) }), async (d, user) => {
  await db.$transaction(async (tx) => {
    await tx.additionalCharge.create({ data: { orderId: d.orderId, description: d.description, amountAzn: d.amountAzn } });
    await addEvent(tx, d.orderId, EVENT.CHARGE_ADDED, { actorId: user.id });
  });
});

export const waiveChargeAction = guarded('staff', z.object({ chargeId: id }), async (d) => {
  await db.additionalCharge.update({ where: { id: d.chargeId }, data: { status: 'WAIVED' } });
});

// ── Tracking & media ─────────────────────────────────────────────

export const addTrackingAction = guarded(
  'staff',
  z.object({ orderId: id, carrier: text(80).min(1), trackingNumber: text(80).min(3), status: text(120) }),
  async (d, user) => {
    await db.$transaction(async (tx) => {
      await tx.tracking.create({ data: { orderId: d.orderId, carrier: d.carrier, trackingNumber: d.trackingNumber, status: d.status || null } });
      await addEvent(tx, d.orderId, EVENT.TRACKING_ADDED, { actorId: user.id });
    });
  },
);

export const updateTrackingAction = guarded('staff', z.object({ trackingId: id, status: text(120) }), async (d) => {
  await db.tracking.update({ where: { id: d.trackingId }, data: { status: d.status || null } });
});

export const removeTrackingAction = guarded('staff', z.object({ trackingId: id }), async (d) => {
  await db.tracking.delete({ where: { id: d.trackingId } });
});

export const deleteMediaAction = guarded('staff', z.object({ mediaId: id }), async (d) => {
  const media = await db.orderMedia.findUnique({ where: { id: d.mediaId } });
  // Customer reference photos are part of the request and are never deleted by staff.
  if (!media || media.kind === 'CUSTOMER_REFERENCE') return { ok: false };
  await db.orderMedia.delete({ where: { id: media.id } });
  await storage().delete(media.storageKey);
});

// ── Customers ────────────────────────────────────────────────────

export const saveCustomerAction = guarded('staff', z.object({ userId: id, adminNotes: text(4000), accountType: z.enum(['PERSONAL', 'BUSINESS']) }), async (d) => {
  // Scoped to customers so this can never touch staff accounts or roles.
  await db.user.updateMany({ where: { id: d.userId, role: 'CUSTOMER' }, data: { adminNotes: d.adminNotes || null, accountType: d.accountType } });
});

// ── Settings (admin only) ────────────────────────────────────────

export const saveGeneralAction = guarded(
  'admin',
  z.object({ quoteValidityDays: z.coerce.number(), commissionBasis: z.string(), sourcingFeeAzn: z.coerce.number() }),
  async (d) => {
    const parsed = settingSchemas.general.safeParse(d);
    if (!parsed.success) return { ok: false };
    await saveSetting('general', parsed.data);
  },
);

export const saveContactAction = guarded('admin', settingSchemas.contact, async (d) => {
  await saveSetting('contact', { ...d, whatsapp: d.whatsapp.replace(/\D/g, '') });
});

export const savePaymentTextAction = guarded('admin', settingSchemas.payment, (d) => saveSetting('payment', d));
export const saveCustomsTextAction = guarded('admin', settingSchemas.customs, (d) => saveSetting('customs', d));

export const saveRateAction = guarded('admin', z.object({ currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/), rateToAzn: z.coerce.number().positive().max(100_000) }), async (d) => {
  if (d.currency === 'AZN') return { ok: false };
  await db.exchangeRate.upsert({ where: { currency: d.currency }, create: d, update: { rateToAzn: d.rateToAzn } });
});

export const deleteRateAction = guarded('admin', z.object({ currency: z.string() }), async (d) => {
  // USD drives cargo pricing; region default currencies must keep a rate.
  const inUse = d.currency === 'USD' || (await db.region.count({ where: { defaultCurrency: d.currency } })) > 0;
  if (inUse) return { ok: false };
  await db.exchangeRate.delete({ where: { currency: d.currency } });
});

export const saveRegionAction = guarded(
  'admin',
  z.object({
    key: key.transform((v) => v.toUpperCase()),
    name: text(60).min(1),
    enabled: checkbox,
    defaultCurrency: z.string().regex(/^[A-Z]{3}$/),
    commissionPercent: z.coerce.number().min(0).max(100),
    minCommissionAzn: money,
    cargoPerKgUsd: money,
    minBillableWeightKg: z.coerce.number().min(0).max(1000),
    customsNote: text(1000),
    isNew: z.string().optional(),
  }),
  async ({ key: regionKey, isNew, ...data }) => {
    const { m } = await getI18n();
    if (!(await db.exchangeRate.findUnique({ where: { currency: data.defaultCurrency } }))) return { ok: false };
    const existing = await db.region.findUnique({ where: { key: regionKey } });
    if (isNew && existing) return { ok: false, message: m.admin.settings.keyExists };
    const values = { ...data, customsNote: data.customsNote || null };
    await db.region.upsert({ where: { key: regionKey }, create: { key: regionKey, sortOrder: 100, ...values }, update: values });
  },
);

export const saveMarketplaceAction = guarded(
  'admin',
  z.object({ key: key.transform((v) => v.toLowerCase()), name: text(60).min(1), regionKey: id, hostPatterns: text(500), enabled: checkbox, isNew: z.string().optional() }),
  async (d) => {
    const { m } = await getI18n();
    if (!(await db.region.findUnique({ where: { key: d.regionKey } }))) return { ok: false };
    const existing = await db.marketplace.findUnique({ where: { key: d.key } });
    if (d.isNew && existing) return { ok: false, message: m.admin.settings.keyExists };
    const hostPatterns = d.hostPatterns
      .split(',')
      .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, ''))
      .filter((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h));
    const values = { name: d.name, regionKey: d.regionKey, hostPatterns, enabled: d.enabled };
    await db.marketplace.upsert({ where: { key: d.key }, create: { key: d.key, sortOrder: 100, ...values }, update: values });
  },
);

export const saveStatusAction = guarded(
  'admin',
  z.object({
    key: key.transform((v) => v.toLowerCase()),
    labelAz: text(80).min(1),
    labelRu: text(80).min(1),
    labelEn: text(80).min(1),
    sortOrder: z.coerce.number().int().min(0).max(100_000),
    active: checkbox,
    showOnTimeline: checkbox,
    isNew: z.string().optional(),
  }),
  async ({ key: statusKey, isNew, ...data }) => {
    const { m } = await getI18n();
    const existing = await db.orderStatus.findUnique({ where: { key: statusKey } });
    if (isNew && existing) return { ok: false, message: m.admin.settings.keyExists };
    // System statuses drive quotation/payment logic and always stay active.
    const values = { ...data, active: existing?.isSystem ? true : data.active };
    await db.orderStatus.upsert({ where: { key: statusKey }, create: { key: statusKey, ...values }, update: values });
  },
);
