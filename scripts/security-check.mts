// Smoke test for access control against a running dev server (default http://localhost:3000).
//   npx tsx scripts/security-check.mts
// Creates a temporary session for one customer and checks they cannot reach
// another customer's order, media, or any admin surface. Cleans up after itself.
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const base = process.env.APP_URL ?? 'http://localhost:3000';
const db = new PrismaClient();
let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const get = (path: string, cookie?: string, init: RequestInit = {}) =>
  fetch(base + path, { redirect: 'manual', ...init, headers: { ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) } });

// Two different customers that both have orders.
const owners = await db.user.findMany({ where: { role: 'CUSTOMER', orders: { some: {} } }, take: 2, include: { orders: { take: 1, include: { media: { take: 1 } } } } });
if (owners.length < 2) throw new Error('Need two customers with orders (run the seed).');
const [attacker, victim] = owners;
const victimOrder = victim.orders[0];
const anyMedia = await db.orderMedia.findFirst({ where: { order: { userId: { not: attacker.id } } } });

const token = randomBytes(32).toString('base64url');
const session = await db.session.create({
  data: { userId: attacker.id, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 60_000) },
});
const cookie = `tq_session=${token}`;

try {
  // ── Anonymous ──
  let r = await get('/admin');
  check('anonymous /admin redirects to login', r.status === 307 && (r.headers.get('location') ?? '').includes('/login'), String(r.status));
  r = await get('/dashboard');
  check('anonymous /dashboard redirects to login', r.status === 307 && (r.headers.get('location') ?? '').includes('/login'), String(r.status));
  r = await get('/api/media/anything');
  check('anonymous media request is rejected', r.status === 401, String(r.status));
  r = await get('/api/orders', undefined, { method: 'POST', body: new FormData() });
  check('anonymous order creation is rejected', r.status === 401, String(r.status));
  r = await get(`/api/admin/orders/${victimOrder.id}/media`, undefined, { method: 'POST', body: new FormData() });
  check('anonymous admin upload is rejected', r.status === 403, String(r.status));

  // ── Customer A against customer B ──
  r = await get('/dashboard', cookie);
  check('customer can open own dashboard', r.status === 200, String(r.status));
  r = await get(`/dashboard/orders/${victimOrder.id}`, cookie);
  check("customer cannot open another customer's order", r.status === 404, String(r.status));
  if (anyMedia) {
    r = await get(`/api/media/${anyMedia.id}`, cookie);
    check("customer cannot fetch another customer's media", r.status === 404, String(r.status));
  } else {
    console.log('SKIP  media isolation (no media of another customer exists yet)');
  }
  r = await get('/admin', cookie);
  check('customer is redirected away from /admin', r.status === 307 && !(r.headers.get('location') ?? '').includes('/admin'), `${r.status} -> ${r.headers.get('location')}`);
  r = await get('/admin/settings', cookie);
  check('customer is redirected away from /admin/settings', r.status === 307, String(r.status));
  r = await get(`/api/admin/orders/${victimOrder.id}/media`, cookie, { method: 'POST', body: new FormData() });
  check('customer cannot upload inspection media', r.status === 403, String(r.status));
  r = await get('/api/orders', cookie, { method: 'POST', body: new FormData(), headers: { origin: 'https://evil.example' } });
  check('cross-origin order POST is rejected', r.status === 403, String(r.status));
} finally {
  await db.session.delete({ where: { id: session.id } });
  await db.$disconnect();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll access-control checks passed');
process.exit(failed ? 1 : 0);
