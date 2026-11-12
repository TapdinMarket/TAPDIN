'use server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionState } from '@/components/action-form';
import { createSession, destroySession, hashPassword, isStaff, rateLimit, safeNext, verifyPassword } from '@/lib/auth';
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
  revalidatePath('/', 'layout');
}
