'use server';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import type { ActionState } from '@/components/action-form';
import { getCurrentUser, isStaff, type SessionUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { getI18n } from '@/i18n/server';
import { addEvent, advanceAfterPayment, EVENT, setOrderStatus, STATUS } from '@/lib/orders';
import { isComingSoon } from '@/lib/regions';
import { notifyOrder } from '@/lib/notifications';
import { refreshRatesFromCbar } from '@/lib/daily';
import { calculateOrderQuote } from '@/lib/pricing/engine';
import { getSettings, saveSetting, settingSchemas } from '@/lib/settings';
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
  const before = await db.order.findUnique({ where: { id: d.orderId }, select: { statusKey: true } });
  if (!before) return { ok: false };
  await db.$transaction((tx) => setOrderStatus(tx, d.orderId, d.statusKey, user.id));
  // Customer notifications run after the response; only some statuses notify (see NOTIFY_STATUSES).
  if (before.statusKey !== d.statusKey) after(() => notifyOrder(d.orderId, 'status_update', { statusKey: d.statusKey }));
});

export const updateClassificationAction = guarded(
  'staff',
  z.object({ orderId: id, regionKey: text(10), type: z.enum(['PERSONAL', 'B2B']) }),
  async (d) => {
    const region = d.regionKey ? await db.region.findUnique({ where: { key: d.regionKey } }) : null;
    await db.order.update({ where: { id: d.orderId }, data: { regionKey: region?.key ?? null, type: d.type } });
  },
);

/**
 * Marks an item out of stock (or back in stock). Allowed until the customer pays (no confirmed or reported payment).
 * Any open or accepted-but-unpaid quotation no longer matches the order: it is withdrawn, the order goes back to
 * price calculation, and the customer chooses to continue without the item or to replace it.
 */
export const setItemAvailabilityAction = guarded('staff', z.object({ itemId: id, unavailable: z.enum(['true', 'false']) }), async (d, user) => {
  const item = await db.orderItem.findUnique({ where: { id: d.itemId }, include: { order: { include: { payments: { select: { status: true } } } } } });
  if (!item) return { ok: false };
  if (item.order.payments.some((p) => p.status === 'CONFIRMED' || p.status === 'PENDING')) return { ok: false, message: (await getI18n()).m.admin.order.availabilityLocked };
  const unavailable = d.unavailable === 'true';
  if (item.unavailable === unavailable || item.resolution === 'REPLACED') return;
  await db.$transaction(async (tx) => {
    await tx.orderItem.update({ where: { id: item.id }, data: { unavailable, resolution: unavailable ? 'PENDING' : null } });
    const withdrawn = await tx.quotation.updateMany({ where: { orderId: item.orderId, status: { in: ['SENT', 'ACCEPTED'] } }, data: { status: 'SUPERSEDED', decidedAt: new Date() } });
    // Nothing is paid yet, so any open charge belongs to the withdrawn quotation (its insurance): drop it too.
    await tx.additionalCharge.updateMany({ where: { orderId: item.orderId, status: 'DUE' }, data: { status: 'WAIVED' } });
    await addEvent(tx, item.orderId, unavailable ? 'item_unavailable' : 'item_available', { actorId: user.id });
    if (withdrawn.count > 0) await setOrderStatus(tx, item.orderId, STATUS.PRICE_CALCULATION, user.id);
  });
  if (unavailable) after(() => notifyOrder(item.orderId, 'item_unavailable', { itemTitle: item.title ?? item.description ?? '', logKey: `item_unavailable:${item.id}` }));
});

export const updateItemMarketplaceAction = guarded('staff', z.object({ itemId: id, marketplace: text(30) }), async (d) => {
  const marketplace = d.marketplace ? await db.marketplace.findUnique({ where: { key: d.marketplace } }) : null;
  await db.orderItem.update({ where: { id: d.itemId }, data: { sourceMarketplace: marketplace?.key ?? null } });
});

export const addNoteAction = guarded('staff', z.object({ orderId: id, body: text(4000).min(1) }), async (d, user) => {
  await db.internalNote.create({ data: { orderId: d.orderId, authorId: user.id, body: d.body } });
});

// ── Quotations ───────────────────────────────────────────────────

/** Per-item fields arrive as `unitPrice__<itemId>` etc.; the order's items are read from the database. */
const lineSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  exchangeRate: z.coerce.number().positive().max(100_000),
  unitPrice: z.coerce.number().positive().max(10_000_000),
  quantity: z.coerce.number().int().min(1).max(10_000),
  domesticShipping: money,
});

const quoteSchema = z.looseObject({
  orderId: id,
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
  const order = await db.order.findUnique({
    where: { id: d.orderId },
    include: { quotations: { select: { version: true, status: true } }, items: { where: { unavailable: false }, orderBy: { position: 'asc' }, select: { id: true } } },
  });
  const closed: string[] = [STATUS.CANCELLED, STATUS.COMPLETED];
  if (!order || closed.includes(order.statusKey) || order.quotations.some((q) => q.status === 'ACCEPTED') || order.items.length === 0) return { ok: false };
  // Every item must be priced; a missing or invalid line rejects the whole quotation.
  const raw = d as Record<string, unknown>;
  const lines: z.infer<typeof lineSchema>[] = [];
  for (const item of order.items) {
    const parsed = lineSchema.safeParse({
      currency: raw[`currency__${item.id}`],
      exchangeRate: raw[`exchangeRate__${item.id}`],
      unitPrice: raw[`unitPrice__${item.id}`],
      quantity: raw[`quantity__${item.id}`],
      domesticShipping: raw[`domesticShipping__${item.id}`] ?? 0,
    });
    if (!parsed.success) return { ok: false };
    lines.push(parsed.data);
  }
  // AZN needs no rate (1:1); every other currency must have one in Settings.
  const foreign = [...new Set(lines.map((l) => l.currency))].filter((c) => c !== 'AZN');
  const known = await db.exchangeRate.count({ where: { currency: { in: foreign } } });
  if (known !== foreign.length) return { ok: false };
  for (const l of lines) if (l.currency === 'AZN') l.exchangeRate = 1;
  // No prices for directions that are not open yet, even if the form is submitted directly.
  const region = order.regionKey ? await db.region.findUnique({ where: { key: order.regionKey } }) : null;
  if (isComingSoon(region)) return { ok: false, message: (await getI18n()).m.admin.quote.regionSoon };

  const b = calculateOrderQuote({ ...d, lines });
  // Optional insurance: offered on the product value, added only if the customer opts in when accepting.
  const { general } = await getSettings();
  const insuranceAzn = Math.round(b.productCostAzn * general.insurancePercent) / 100;
  const version = Math.max(0, ...order.quotations.map((q) => q.version)) + 1;

  await db.$transaction(async (tx) => {
    await tx.quotation.updateMany({ where: { orderId: order.id, status: 'SENT' }, data: { status: 'SUPERSEDED', decidedAt: new Date() } });
    await tx.quotation.create({
      data: {
        orderId: order.id,
        version,
        weightKg: d.weightKg ?? null,
        commissionPercent: d.commissionPercent,
        commissionBasis: d.commissionBasis,
        minCommissionAzn: d.minCommissionAzn,
        productCostAzn: b.productCostAzn,
        domesticShippingAzn: b.domesticShippingAzn,
        internationalShippingAzn: b.internationalShippingAzn,
        serviceFeeAzn: b.serviceFeeAzn,
        sourcingFeeAzn: b.sourcingFeeAzn,
        customsChargesAzn: b.customsChargesAzn,
        otherExpensesAzn: b.otherExpensesAzn,
        insuranceAzn,
        totalAzn: b.totalAzn,
        noteToCustomer: d.noteToCustomer || null,
        expiresAt: new Date(Date.now() + d.validDays * 86_400_000),
        lines: {
          create: order.items.map((item, i) => ({
            itemId: item.id,
            position: i,
            currency: lines[i].currency,
            exchangeRate: lines[i].exchangeRate,
            unitPrice: lines[i].unitPrice,
            quantity: lines[i].quantity,
            domesticShipping: lines[i].domesticShipping,
            productCost: b.lines[i].productCost,
            productCostAzn: b.lines[i].productCostAzn,
            domesticShippingAzn: b.lines[i].domesticShippingAzn,
          })),
        },
      },
    });
    await addEvent(tx, order.id, EVENT.QUOTE_SENT, { actorId: user.id });
    await setOrderStatus(tx, order.id, STATUS.AWAITING_APPROVAL, user.id);
  });
  after(() => notifyOrder(order.id, 'quote_ready'));
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
    after(() => notifyOrder(d.orderId, 'payment_confirmed', { amountAzn: d.amount }));
  },
);

export const setPaymentStatusAction = guarded('staff', z.object({ paymentId: id, status: z.enum(['CONFIRMED', 'FAILED', 'REFUNDED']) }), async (d, user) => {
  let confirmed: { orderId: string; amount: number } | null = null;
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
      confirmed = { orderId: payment.orderId, amount: Number(payment.amount) };
    } else if (d.status === 'FAILED') {
      await addEvent(tx, payment.orderId, EVENT.PAYMENT_FAILED, { actorId: user.id });
    } else {
      await addEvent(tx, payment.orderId, 'payment_refunded', { actorId: user.id, visible: false });
    }
  });
  const done = confirmed as { orderId: string; amount: number } | null;
  if (done) after(() => notifyOrder(done.orderId, 'payment_confirmed', { amountAzn: done.amount }));
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
  z.object({ quoteValidityDays: z.coerce.number(), commissionBasis: z.string(), sourcingFeeAzn: z.coerce.number(), insurancePercent: z.coerce.number() }),
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
  // Typed by hand: marked as manual until the next CBAR refresh.
  if (d.currency === 'AZN') return { ok: false };
  await db.exchangeRate.upsert({ where: { currency: d.currency }, create: { ...d, source: 'MANUAL' }, update: { rateToAzn: d.rateToAzn, source: 'MANUAL' } });
});

export const refreshRatesAction = guarded('admin', z.object({}), async () => {
  const { m } = await getI18n();
  try {
    const r = await refreshRatesFromCbar();
    return { ok: true, message: `${m.admin.settings.cbarDone} ${r.date ?? ''}: ${r.updated.join(', ') || '—'}${r.missing.length ? ` · ${m.admin.settings.cbarMissing}: ${r.missing.join(', ')}` : ''}` };
  } catch {
    return { ok: false, message: m.admin.settings.cbarFailed };
  }
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
    status: z.enum(['ACTIVE', 'COMING_SOON']),
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
