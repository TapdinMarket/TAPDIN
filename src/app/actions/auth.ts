'use server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/components/action-form';
import { createHash, randomBytes } from 'node:crypto';
import { createSession, destroySession, getCurrentUser, hashPassword, isStaff, rateLimit, safeNext, verifyPassword } from '@/lib/auth';
import { brand } from '@/config/brand';
import { sendEmail } from '@/lib/notifications';
import { asLocale, buildResetMessage } from '@/lib/notifications/messages';
import { getSettings } from '@/lib/settings';
import { db } from '@/lib/db';
import { isLocale, LOCALE_COOKIE } from '@/i18n/config';
import { getI18n } from '@/i18n/server';

const clientKey = async () => (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';

const loginSchema = z.object({
  email: z.email().max(200).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1).max(200),
});

export async function loginAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { m } = await getI18n();
  if (!rateLimit(`login:${await clientKey()}`, 10, 10 * 60_000)) return { ok: false, message: m.auth.rate };

  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: m.auth.invalid };

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  // Always run a hash comparison so response time does not reveal whether the email exists.
  const hash = user?.passwordHash ?? '$2b$12$C6UzMDM.H6dfI/f/IKcEeO5KlnQpYp1bV1J1yJ4vXkqQFfF0p0S5a';
  const valid = await verifyPassword(parsed.data.password, hash);
  if (!user || !valid) return { ok: false, message: m.auth.invalid };

  await createSession(user.id);
  const fallback = isStaff(user) ? '/admin' : '/dashboard';
  redirect(safeNext(formData.get('next')?.toString(), fallback));
}

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().max(200).transform((v) => v.toLowerCase().trim()),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/),
  password: z.string().min(8).max(200),
});

export async function registerAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { m, locale } = await getI18n();
  if (!rateLimit(`register:${await clientKey()}`, 8, 60 * 60_000)) return { ok: false, message: m.auth.rate };

  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const message =
      field === 'name' ? m.auth.fieldName : field === 'email' ? m.auth.fieldEmail : field === 'phone' ? m.auth.fieldPhone : m.auth.fieldPassword;
    return { ok: false, message };
  }

  const exists = await db.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
  if (exists) return { ok: false, message: m.auth.exists };

  const user = await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      passwordHash: await hashPassword(parsed.data.password),
      locale,
      // WhatsApp only with an explicit tick on the form; email updates are on by default and can be turned off.
      notifyWhatsApp: formData.get('notifyWhatsApp') === 'on',
      // Role is never taken from the client: every self-registered account is a customer.
      role: 'CUSTOMER',
    },
  });
  await createSession(user.id);
  redirect(safeNext(formData.get('next')?.toString(), '/order'));
}

export async function logoutAction() {
  await destroySession();
  redirect('/');
}

export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  const user = await getCurrentUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { locale } });
  revalidatePath('/', 'layout');
}

// ── Password reset ───────────────────────────────────────────────
const RESET_TTL_MS = 60 * 60_000;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Sends a one-time reset link. The answer is the same whether or not the email exists, so the form cannot be used
 * to find out who has an account. Rate-limited per IP and per address.
 */
export async function requestPasswordResetAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { m } = await getI18n();
  const email = z.email().max(200).safeParse(String(formData.get('email') ?? '').trim().toLowerCase());
  if (!email.success) return { ok: false, message: m.auth.fieldEmail };
  if (!rateLimit(`reset:${await clientKey()}`, 5, 60 * 60_000) || !rateLimit(`reset:${email.data}`, 3, 60 * 60_000)) {
    return { ok: false, message: m.auth.rate };
  }
  const user = await db.user.findUnique({ where: { email: email.data } });
  if (user) {
    const token = randomBytes(32).toString('base64url');
    await db.passwordReset.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) } });
    const { contact } = await getSettings();
    const url = `${process.env.APP_URL ?? 'http://localhost:3000'}/reset?token=${token}`;
    try {
      await sendEmail(user.email, buildResetMessage(asLocale(user.locale), { name: user.name, url, brand: brand.name, contact: [contact.email, contact.phone].filter(Boolean).join(' · ') }));
    } catch (error) {
      console.error('Password reset email failed', error);
    }
  }
  return { ok: true, message: m.auth.resetSent };
}

/** Sets a new password from a valid, unused, unexpired link; signs out every other session. */
export async function resetPasswordAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const { m } = await getI18n();
  if (!rateLimit(`reset-use:${await clientKey()}`, 10, 60 * 60_000)) return { ok: false, message: m.auth.rate };
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  if (password.length < 8 || password.length > 200) return { ok: false, message: m.auth.fieldPassword };
  const reset = token ? await db.passwordReset.findUnique({ where: { tokenHash: sha256(token) } }) : null;
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) return { ok: false, message: m.auth.resetInvalid };

  const used = await db.$transaction(async (tx) => {
    // Conditional update: the same link cannot be used twice, even by two requests at once.
    const claimed = await tx.passwordReset.updateMany({ where: { id: reset.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) return false;
    await tx.user.update({ where: { id: reset.userId }, data: { passwordHash: await hashPassword(password) } });
    await tx.session.deleteMany({ where: { userId: reset.userId } });
    await tx.passwordReset.updateMany({ where: { userId: reset.userId, usedAt: null }, data: { usedAt: new Date() } });
    return true;
  });
  if (!used) return { ok: false, message: m.auth.resetInvalid };
  await createSession(reset.userId);
  const user = await db.user.findUniqueOrThrow({ where: { id: reset.userId } });
  redirect(isStaff(user) ? '/admin' : '/dashboard');
}
