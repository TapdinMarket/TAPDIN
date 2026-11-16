// Orchestration with injected I/O, so the whole flow is testable without the network.
import { looksLikeWall, parseProductHtml } from './parse.ts';
import { matchSource } from './sources.ts';

export type FetchFailure = 'blocked' | 'timeout' | 'http' | 'network' | 'not_html' | 'redirect';
export class FetchError extends Error {
  readonly kind: FetchFailure;
  constructor(kind: FetchFailure) {
    super(kind);
    this.kind = kind;
  }
}

export type PreviewResult =
  | {
      status: 'ok';
      source: { key: string; name: string };
      productUrl: string;
      imageUrl: string | null;
      price: number | null;
      currency: string | null;
    }
  | { status: 'invalid' }
  | { status: 'unsupported' }
  | { status: 'not_found'; source: { key: string; name: string } }
  | { status: 'unavailable'; source: { key: string; name: string }; reason: FetchFailure };

export type FetchHtml = (url: string) => Promise<{ html: string; finalUrl: string }>;

export function normalizeProductUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export async function previewProduct(raw: string, fetchHtml: FetchHtml): Promise<PreviewResult> {
  const productUrl = normalizeProductUrl(raw);
  if (!productUrl || productUrl.length > 2000) return { status: 'invalid' };
  const match = matchSource(productUrl);
  if (!match) return { status: 'unsupported' };
  const source = { key: match.key, name: match.name };

  let page: { html: string; finalUrl: string };
  try {
    page = await fetchHtml(productUrl);
  } catch (error) {
    return { status: 'unavailable', source, reason: error instanceof FetchError ? error.kind : 'network' };
  }

  const parsed = parseProductHtml(page.html, page.finalUrl);
  // A shared logo on a non-product page is not a product photo: without product signals we report nothing.
  if (!parsed.isProduct || (!parsed.imageUrl && parsed.price === null)) {
    return looksLikeWall(page.html) ? { status: 'unavailable', source, reason: 'blocked' } : { status: 'not_found', source };
  }
  return { status: 'ok', source, productUrl, imageUrl: parsed.imageUrl, price: parsed.price, currency: parsed.price === null ? null : parsed.currency };
}

/** Columns stored with an order. No preview (or a failed one) means the order simply continues manually. */
export function previewOrderFields(result: PreviewResult | null) {
  if (!result || result.status !== 'ok') {
    return { previewImageUrl: null, previewPrice: null, previewCurrency: null, previewFetchedAt: null };
  }
  return {
    previewImageUrl: result.imageUrl,
    previewPrice: result.price,
    previewCurrency: result.currency,
    previewFetchedAt: new Date(),
  };
}
