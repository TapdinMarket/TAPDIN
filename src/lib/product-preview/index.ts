import 'server-only';
import { normalizeProductUrl, previewProduct, type PreviewResult } from './core';
import { fetchProductPage } from './fetch-page';

export type { PreviewResult } from './core';
export { previewOrderFields } from './core';

// Short-lived per-instance cache: the order form asks for a preview, and the order API later reuses the
// same server-side result. The client never sends image or price itself, so they cannot be forged.
const cache = new Map<string, { result: PreviewResult; expires: number }>();
const OK_TTL = 30 * 60_000;
const FAIL_TTL = 2 * 60_000;
const MAX_ENTRIES = 500;

export async function getProductPreview(rawUrl: string): Promise<PreviewResult> {
  const key = normalizeProductUrl(rawUrl);
  const hit = key ? cache.get(key) : undefined;
  if (hit && hit.expires > Date.now()) return hit.result;

  const result = await previewProduct(rawUrl, fetchProductPage);
  if (key && (result.status === 'ok' || result.status === 'not_found' || result.status === 'unavailable')) {
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(key, { result, expires: Date.now() + (result.status === 'ok' ? OK_TTL : FAIL_TTL) });
  }
  return result;
}

/** The preview the customer saw for this URL, if this server produced one recently. Never fetches. */
export function getCachedPreview(rawUrl: string): PreviewResult | null {
  const key = normalizeProductUrl(rawUrl);
  const hit = key ? cache.get(key) : undefined;
  return hit && hit.expires > Date.now() ? hit.result : null;
}
