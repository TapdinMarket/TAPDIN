// Shared (client + server) marketplace detection. Pure, no imports.

export type MarketplaceInfo = {
  key: string;
  name: string;
  regionKey: string;
  hostPatterns: string[];
};

export function parseHttpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** Matches the URL hostname against configured host suffixes. Returns null when unknown. */
export function detectMarketplace(raw: string, marketplaces: MarketplaceInfo[]): MarketplaceInfo | null {
  const url = parseHttpUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  for (const m of marketplaces) {
    for (const pattern of m.hostPatterns) {
      const p = pattern.toLowerCase().trim();
      if (p && (host === p || host.endsWith(`.${p}`))) return m;
    }
  }
  return null;
}
