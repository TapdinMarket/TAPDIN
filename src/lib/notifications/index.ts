import 'server-only';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Transporter } from 'nodemailer';
import { brand } from '@/config/brand';
import { statusLabel } from '@/i18n/config';
import { db } from '@/lib/db';
import { formatAzn, formatDate } from '@/lib/format';
import { orderNo } from '@/lib/orders';
import { getSettings } from '@/lib/settings';
import { asLocale, buildMessage, notifiesStatus, whatsappNumber, type NotifyEvent } from './messages';

/**
 * Customer notifications. Channels:
 *  - Email over SMTP (any provider) when SMTP_HOST is set. Without it, in development, the email is written to
 *    storage/outbox/*.html so it can be opened and checked; nothing leaves the machine.
 *  - WhatsApp Cloud API when WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID are set, using approved templates
 *    (see WHATSAPP_TEMPLATES). Only for customers who opted in.
 * Every attempt is written to the Notification table, so staff can see what reached the customer.
 * Failures never break the staff action that triggered them.
 */

type Extra = {
  statusKey?: string;
  amountAzn?: number;
  itemTitle?: string;
  /** Stored as the log event; reminders use it to make sure they are sent only once. */
  logKey?: string;
};

let transporter: Transporter | null | undefined;
async function mailer(): Promise<Transporter | null> {
  if (transporter !== undefined) return transporter;
  if (!process.env.SMTP_HOST) return (transporter = null);
  const nodemailer = await import('nodemailer');
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transporter;
}

/** Sends one email (SMTP), or saves it to storage/outbox in development when SMTP is not configured. */
export async function sendEmail(to: string, msg: { subject: string; text: string; html: string }) {
  const transport = await mailer();
  if (!transport) {
    if (process.env.NODE_ENV === 'production') return { status: 'SKIPPED' as const, detail: 'email not configured (SMTP_HOST)' };
    const dir = resolve(/*turbopackIgnore: true*/ process.env.STORAGE_LOCAL_DIR ?? './storage/uploads', '..', 'outbox');
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${to.replace(/[^a-z0-9]/gi, '_')}.html`);
    await writeFile(file, msg.html);
    return { status: 'SKIPPED' as const, detail: `dev outbox: ${file}` };
  }
  await transport.sendMail({ from: process.env.MAIL_FROM ?? `${brand.legalName} <no-reply@${brand.domain}>`, to, subject: msg.subject, text: msg.text, html: msg.html });
  return { status: 'SENT' as const, detail: null };
}

async function sendWhatsApp(to: string, msg: ReturnType<typeof buildMessage>) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { status: 'SKIPPED' as const, detail: 'WhatsApp not configured' };
  const version = process.env.WHATSAPP_API_VERSION ?? 'v21.0';
  const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: msg.whatsapp.template,
        language: { code: msg.whatsapp.language },
        components: [{ type: 'body', parameters: msg.whatsapp.params.map((text) => ({ type: 'text', text: text.slice(0, 200) })) }],
      },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { status: 'FAILED' as const, detail: `WhatsApp HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` };
  return { status: 'SENT' as const, detail: null };
}

/** Notify the order's customer. Safe to call after any staff action; never throws. */
export async function notifyOrder(orderId: string, event: NotifyEvent, extra: Extra = {}) {
  try {
    if (event === 'status_update' && !(extra.statusKey && notifiesStatus(extra.statusKey))) return;
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { user: true, quotations: { where: { status: 'SENT' }, orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!order || order.user.role !== 'CUSTOMER') return;
    const locale = asLocale(order.user.locale);
    const status = extra.statusKey ? await db.orderStatus.findUnique({ where: { key: extra.statusKey } }) : null;
    const quote = order.quotations[0];
    const base = process.env.APP_URL ?? 'http://localhost:3000';
    const { contact } = await getSettings();

    const msg = buildMessage(event, locale, {
      name: order.user.name,
      orderNo: orderNo(order.number),
      url: `${base}/dashboard/orders/${order.id}`,
      brand: brand.name,
      contact: [contact.email, contact.phone].filter(Boolean).join(' · '),
      amount: (event === 'quote_ready' || event === 'quote_expiring') && quote ? formatAzn(Number(quote.totalAzn), locale) : extra.amountAzn !== undefined ? formatAzn(extra.amountAzn, locale) : undefined,
      validUntil: quote?.expiresAt ? formatDate(quote.expiresAt, locale) : undefined,
      statusKey: extra.statusKey,
      itemTitle: extra.itemTitle,
      statusLabel: status ? statusLabel(status, locale) : undefined,
    });

    const log = (channel: 'EMAIL' | 'WHATSAPP', status: 'SENT' | 'FAILED' | 'SKIPPED', detail: string | null) =>
      db.notification.create({ data: { userId: order.userId, orderId: order.id, channel, event: extra.logKey ?? (extra.statusKey ? `${event}:${extra.statusKey}` : event), status, detail } });

    const jobs: Promise<unknown>[] = [];
    jobs.push(
      (async () => {
        if (!order.user.notifyEmail) return log('EMAIL', 'SKIPPED', 'customer turned email off');
        try {
          const r = await sendEmail(order.user.email, msg);
          return log('EMAIL', r.status, r.detail);
        } catch (error) {
          return log('EMAIL', 'FAILED', String((error as Error).message ?? error).slice(0, 300));
        }
      })(),
    );
    jobs.push(
      (async () => {
        if (!order.user.notifyWhatsApp) return log('WHATSAPP', 'SKIPPED', 'customer did not opt in');
        const to = whatsappNumber(order.user.phone);
        if (!to) return log('WHATSAPP', 'SKIPPED', 'no valid phone number');
        try {
          const r = await sendWhatsApp(to, msg);
          return log('WHATSAPP', r.status, r.detail);
        } catch (error) {
          return log('WHATSAPP', 'FAILED', String((error as Error).message ?? error).slice(0, 300));
        }
      })(),
    );
    await Promise.all(jobs);
  } catch (error) {
    console.error('Notification failed', error);
  }
}
