// Backup:   npm run db:backup                 → backups/<date-time>/{data.json, uploads/}
// Restore:  npm run db:restore -- <backup dir> → into an EMPTY database that already has the schema
//           (run `npx prisma migrate deploy` on it first).
//
// Works with any PostgreSQL the app can reach (DATABASE_URL) and needs no pg_dump. On a server with real PostgreSQL
// tools, pg_dump is fine too; this script exists so a copy can always be made with what the project ships with.
import { PrismaClient } from '@prisma/client';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

for (const line of existsSync('.env') ? readFileSync('.env', 'utf8').split(/\r?\n/) : []) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

/** Parent tables first, so foreign keys are satisfied on restore. */
const ORDER = [
  'User', 'Session', 'PasswordReset', 'BusinessProfile', 'Region', 'Marketplace', 'ExchangeRate', 'OrderStatus', 'Setting',
  'Order', 'OrderItem', 'OrderMedia', 'Quotation', 'QuotationLine', 'Payment', 'AdditionalCharge', 'Tracking', 'OrderEvent',
  'InternalNote', 'Notification',
];
const uploadsDir = resolve(process.env.STORAGE_LOCAL_DIR ?? './storage/uploads');
const db = new PrismaClient();

async function tables(): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`,
  );
  const names = rows.map((r) => r.table_name);
  const unknown = names.filter((n) => !ORDER.includes(n));
  if (unknown.length) throw new Error(`Tables missing from the backup order list: ${unknown.join(', ')} — add them to ORDER in scripts/backup.mts`);
  return ORDER.filter((n) => names.includes(n));
}

async function backup() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = resolve('backups', stamp);
  mkdirSync(dir, { recursive: true });
  const data: Record<string, unknown[]> = {};
  for (const table of await tables()) {
    const [row] = await db.$queryRawUnsafe<{ rows: unknown[] | null }[]>(`SELECT json_agg(t) AS rows FROM "${table}" t`);
    data[table] = row.rows ?? [];
  }
  writeFileSync(join(dir, 'data.json'), JSON.stringify({ createdAt: new Date().toISOString(), tables: data }));
  if (existsSync(uploadsDir)) cpSync(uploadsDir, join(dir, 'uploads'), { recursive: true });
  const counts = Object.entries(data).map(([t, r]) => `${t}=${r.length}`).join(' ');
  console.log(`Backup written to ${dir}\n${counts}`);
}

async function restore(dir: string) {
  const file = join(resolve(dir), 'data.json');
  if (!existsSync(file)) throw new Error(`No data.json in ${dir}`);
  const { tables: data } = JSON.parse(readFileSync(file, 'utf8')) as { tables: Record<string, unknown[]> };
  const present = await tables();
  for (const table of present) {
    const [{ n }] = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${table}"`);
    if (n > 0n) throw new Error(`Table "${table}" is not empty — restore only into an empty database.`);
  }
  await db.$transaction(
    async (tx) => {
      for (const table of present) {
        const rows = data[table] ?? [];
        if (rows.length === 0) continue;
        await tx.$executeRawUnsafe(`INSERT INTO "${table}" SELECT * FROM json_populate_recordset(NULL::"${table}", $1::json)`, JSON.stringify(rows));
      }
      // Keep order numbers counting up after the restored ones.
      await tx.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"Order"', 'number'), COALESCE((SELECT max(number) FROM "Order"), 0) + 1, false)`);
    },
    { timeout: 120_000 },
  );
  const uploads = join(resolve(dir), 'uploads');
  if (existsSync(uploads)) cpSync(uploads, uploadsDir, { recursive: true });
  console.log(`Restored ${present.map((t) => `${t}=${(data[t] ?? []).length}`).join(' ')}`);
}

const [command, arg] = process.argv.slice(2);
(command === 'restore' ? restore(arg ?? '') : backup())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
