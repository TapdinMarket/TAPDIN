import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { refreshRatesFromCbar, sendReminders } from '@/lib/daily';

/**
 * Daily job: today's CBAR exchange rates + customer reminders. Call it once a day from the server's cron, e.g.
 *   0 10 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://tapdin.az/api/cron/daily
 * Disabled unless CRON_SECRET is set.
 */
export async function POST(request: Request) {
  return run(request);
}
export async function GET(request: Request) {
  return run(request);
}

async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result: Record<string, unknown> = {};
  try {
    result.rates = await refreshRatesFromCbar();
  } catch (error) {
    result.rates = { error: String((error as Error).message ?? error) };
  }
  try {
    result.reminders = await sendReminders();
  } catch (error) {
    result.reminders = { error: String((error as Error).message ?? error) };
  }
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
