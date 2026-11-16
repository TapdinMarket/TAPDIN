import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/); if (m) process.env[m[1]] ??= m[2]; }
const db = new PrismaClient();
const o = await db.order.findUnique({ where: { id: 'cmwd7k6zu0001ycs0jtzb0nv4' }, include: { quotations: true, notifications: true } });
console.log(o?.statusKey, o?.quotations.map((q) => [q.status, String(q.totalAzn)]), o?.notifications.map((n) => [n.channel, n.event, n.status, n.detail]));
await db.$disconnect();
