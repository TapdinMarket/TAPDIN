// Stores whose product pages tapdın may fetch for a preview. Shared by client and server; pure, no imports.
//
// Only hosts listed here are ever requested — this list is the SSRF allow-list. Adding a store means
// adding an entry and, if its pages need it, a dedicated `extract` step in parse.ts.
// Being listed does NOT mean previews work: many stores render prices with JavaScript or block automated
// requests. `verified` records what was actually observed when the adapter was last tested.

export type PreviewSource = {
  key: string;
  name: string;
  hosts: string[];
  /** Last manual test result. `null` = not verified yet. */
  verified: { ok: boolean; note: string } | null;
};

export const PREVIEW_SOURCES: PreviewSource[] = [
  { key: 'temu', name: 'Temu', hosts: ['temu.com'], verified: { ok: false, note: '2026-11-12: product pages return a JavaScript bot challenge instead of HTML' } },
  { key: '1688', name: '1688', hosts: ['1688.com'], verified: { ok: false, note: '2026-11-12: offer pages return a JavaScript verification page' } },
  { key: 'taobao', name: 'Taobao', hosts: ['taobao.com', 'tmall.com'], verified: { ok: false, note: '2026-11-12: item pages redirect to a login wall' } },
  { key: 'pinduoduo', name: 'Pinduoduo', hosts: ['pinduoduo.com', 'yangkeduo.com'], verified: null },
  { key: 'ozon', name: 'Ozon', hosts: ['ozon.ru'], verified: { ok: false, note: '2026-11-12: every page answers with a cookie/JavaScript redirect loop' } },
  { key: 'wildberries', name: 'Wildberries', hosts: ['wildberries.ru'], verified: { ok: false, note: '2026-11-12: product pages answer HTTP 498 (anti-bot)' } },
];

/** The preview source for a URL, or null when the host is not on the allow-list (or the URL is not http/https). */
export function matchSource(raw: string): PreviewSource | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '80' && url.port !== '443') return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  return PREVIEW_SOURCES.find((s) => s.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? null;
}
