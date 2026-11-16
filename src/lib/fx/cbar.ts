// Official exchange rates of the Central Bank of Azerbaijan (CBAR, cbar.az), published daily as XML:
//   https://www.cbar.az/currencies/DD.MM.YYYY.xml
// Pure parsing lives here (unit-tested); the fetch is a thin wrapper.

export type CbarRates = { date: string | null; rates: Record<string, number> };

/** AZN for ONE unit of each foreign currency. Some currencies are quoted per 100 units (RUB, JPY…). */
export function parseCbarXml(xml: string): CbarRates {
  const date = xml.match(/<ValCurs[^>]*\bDate="([^"]+)"/)?.[1] ?? null;
  const rates: Record<string, number> = {};
  for (const [, code, body] of xml.matchAll(/<Valute\s+Code="([A-Z]{3})"\s*>([\s\S]*?)<\/Valute>/g)) {
    const nominal = Number(body.match(/<Nominal>\s*([\d.]+)/)?.[1]);
    const value = Number(body.match(/<Value>\s*([\d.]+)\s*<\/Value>/)?.[1]);
    if (!Number.isFinite(nominal) || nominal <= 0 || !Number.isFinite(value) || value <= 0) continue;
    rates[code] = Math.round((value / nominal) * 1_000_000) / 1_000_000;
  }
  return { date, rates };
}

export function cbarUrl(day: Date) {
  const dd = String(day.getUTCDate()).padStart(2, '0');
  const mm = String(day.getUTCMonth() + 1).padStart(2, '0');
  return `https://www.cbar.az/currencies/${dd}.${mm}.${day.getUTCFullYear()}.xml`;
}

/** Today's bulletin (Baku date). Throws when CBAR is unreachable or the answer has no rates. */
export async function fetchCbarRates(now = new Date()): Promise<CbarRates> {
  const baku = new Date(now.getTime() + 4 * 3_600_000); // UTC+4
  const res = await fetch(cbarUrl(baku), { signal: AbortSignal.timeout(15_000), cache: 'no-store' });
  if (!res.ok) throw new Error(`CBAR HTTP ${res.status}`);
  const parsed = parseCbarXml(await res.text());
  if (Object.keys(parsed.rates).length === 0) throw new Error('CBAR: no rates in the bulletin');
  return parsed;
}
