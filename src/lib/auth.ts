import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from './db';

const COOKIE = 'tq_session';
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
  accountType: 'PERSONAL' | 'BUSINESS';
};

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(COOKIE);
}

/** Current user for this request (deduplicated per render). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  const { id, name, email, phone, role, accountType } = session.user;
  return { id, name, email, phone, role, accountType };
});

export const isStaff = (user: SessionUser | null) => user?.role === 'ADMIN' || user?.role === 'STAFF';

export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  return user;
}

/** Staff and admins may operate orders. */
export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser('/admin');
  if (!isStaff(user)) redirect('/dashboard');
  return user;
}

/** Only admins may change pricing configuration. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireStaff();
  if (user.role !== 'ADMIN') redirect('/admin');
  return user;
}

/** Only allow same-site relative redirects. */
export function safeNext(next: string | null | undefined, fallback: string) {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}

// ── Tiny in-memory rate limiter (per server instance). Replace with Redis when scaling out. ──
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}
