// Local development PostgreSQL without Docker.
// Runs a real PostgreSQL server (binaries shipped by the `embedded-postgres` dev dependency).
// Data lives OUTSIDE the project folder so cloud-sync tools (OneDrive etc.) never touch it.
//
//   npm run db:start        -> starts the server and keeps running (Ctrl+C to stop)
//
// For production use a managed PostgreSQL (Supabase, Neon, RDS...) and set DATABASE_URL.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const port = Number(process.env.DEV_DB_PORT ?? 54329);
const databaseDir = process.env.DEV_DB_DIR ?? join(homedir(), '.tapdiq', 'pgdata');
const dbName = process.env.DEV_DB_NAME ?? 'tapdiq';

mkdirSync(join(databaseDir, '..'), { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
  // The cluster itself is locale-neutral so initdb also works when the project lives in a
  // non-ASCII path (e.g. "Рабочий стол"). The application database below is always UTF-8.
  initdbFlags: ['--encoding=SQL_ASCII', '--locale=C'],
  onLog: () => {},
  onError: (e) => console.error('[dev-db]', String(e)),
});

if (!existsSync(join(databaseDir, 'PG_VERSION'))) {
  console.log('[dev-db] initialising new cluster at', databaseDir);
  await pg.initialise();
}

await pg.start();
const client = pg.getPgClient();
await client.connect();
const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
if (existing.rowCount === 0) {
  await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}" ENCODING 'UTF8' TEMPLATE template0`);
  console.log(`[dev-db] created UTF-8 database "${dbName}"`);
}
await client.end();

console.log(`[dev-db] PostgreSQL ready on postgresql://postgres:postgres@localhost:${port}/${dbName}`);
console.log('[dev-db] press Ctrl+C to stop');

const stop = async () => {
  try {
    await pg.stop();
  } finally {
    process.exit(0);
  }
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
