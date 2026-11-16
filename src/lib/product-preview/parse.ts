// Pure HTML → { image, price, currency } extraction. Uses only data the page publishes for sharing and
// search engines: JSON-LD (schema.org Product), Open Graph / product meta tags and microdata `itemprop`.
// Nothing is guessed: a field the page does not state stays null.

export type ParsedPreview = {
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  /** The page describes itself as a product (JSON-LD Product, og:type product, product price meta). */
  isProduct: boolean;
};

/** Bot challenges, login walls and captcha pages that stores return instead of the product. */
export function looksLikeWall(html: string): boolean {
  const head = html.slice(0, 20_000);
  const hasContent = /<meta[^>]+(og:title|og:image|description)/i.test(head) || /<title>[^<]{3,}/i.test(head);
  return /captcha|challenge|punish|login.(m.)?taobao.com|passport.|antibot|cf-chl|verify you are human/i.test(head) && !hasContent;
}

const SYMBOLS: [RegExp, string][] = [
  [/₽|руб|rub/i, 'RUB'],
  [/€|eur/i, 'EUR'],
  [/£|gbp/i, 'GBP'],
  [/₼|azn/i, 'AZN'],
  [/[¥￥元]|cny|rmb/i, 'CNY'],
  [/us\$|\$|usd/i, 'USD'],
];

/** ISO 4217 code from a code or symbol ("rub", "₽", "US$"). */
export function normalizeCurrency(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (/^[A-Za-z]{3}$/.test(value)) return value.toUpperCase() === 'RUR' ? 'RUB' : value.toUpperCase();
  for (const [pattern, code] of SYMBOLS) if (pattern.test(value)) return code;
  return null;
}

/**
 * Number from a price as pages write it: 29.99 · "1 299,00 ₽" · "1,299.00" · "1.299,50" · "¥268".
 * Returns null for anything that is not a single positive amount.
 */
export function parsePrice(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 && raw < 1e9 ? Math.round(raw * 100) / 100 : null;
  if (typeof raw !== 'string') return null;
  let s = raw.replace(/[\s  ']/g, '').replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s) || s.startsWith('-')) return null;
  // A range ("10-20") is not one price.
  if (s.includes('-')) return null;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma >= 0) {
    // "1,299" is thousands; "12,99" or "1 299,5" is a decimal comma.
    const groups = s.split(',');
    s = groups.length === 2 && groups[1].length !== 3 ? groups.join('.') : groups.join('');
  } else if (lastDot >= 0) {
    const groups = s.split('.');
    if (groups.length > 2 || (groups[1].length === 3 && groups[0] !== '0')) s = groups.join('');
  }
  const value = Number(s);
  return Number.isFinite(value) && value > 0 && value < 1e9 ? Math.round(value * 100) / 100 : null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#x2F': '/', '#47': '/' };
const decode = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (ENTITIES[e]) return ENTITIES[e];
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return m;
  });

/** <meta> tags as a map of lower-cased property / name / itemprop → first content value. */
function metaTags(html: string) {
  const out = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const [, name, , dq, sq, bare] of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attrs[name.toLowerCase()] = decode(dq ?? sq ?? bare ?? '');
    }
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop)?.toLowerCase();
    const content = attrs.content;
    if (key && content && !out.has(key)) out.set(key, content.trim());
  }
  return out;
}

/** All schema.org Product objects found in JSON-LD blocks, including nested @graph entries. */
function jsonLdProducts(html: string) {
  const products: Record<string, unknown>[] = [];
  const visit = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 6) return;
    if (Array.isArray(node)) return node.forEach((n) => visit(n, depth + 1));
    const obj = node as Record<string, unknown>;
    const type = obj['@type'];
    const types = Array.isArray(type) ? type : [type];
    if (types.some((t) => typeof t === 'string' && /^(Product|ProductGroup|IndividualProduct)$/i.test(t))) products.push(obj);
    visit(obj['@graph'], depth + 1);
    visit(obj.mainEntity, depth + 1);
  };
  for (const [, body] of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(body.trim()), 0);
    } catch {
      /* malformed block: ignore it, others may still be valid */
    }
  }
  return products;
}

function firstImage(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = firstImage(v);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return firstImage(obj.url ?? obj.contentUrl);
  }
  return null;
}

function offerPrice(offers: unknown): { price: number | null; currency: string | null } {
  const list = Array.isArray(offers) ? offers : [offers];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const offer = raw as Record<string, unknown>;
    const spec = (Array.isArray(offer.priceSpecification) ? offer.priceSpecification[0] : offer.priceSpecification) as Record<string, unknown> | undefined;
    const price = parsePrice(offer.price ?? offer.lowPrice ?? spec?.price);
    if (price !== null) return { price, currency: normalizeCurrency(offer.priceCurrency ?? spec?.priceCurrency) };
  }
  return { price: null, currency: null };
}

/** Absolute http(s) URL, or null. Protocol-relative and relative URLs are resolved against the page. */
export function absoluteImageUrl(raw: string | null, pageUrl: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim(), pageUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.toString();
  } catch {
    return null;
  }
}

export function parseProductHtml(html: string, pageUrl: string): ParsedPreview {
  let image: string | null = null;
  let price: number | null = null;
  let currency: string | null = null;
  const products = jsonLdProducts(html);

  for (const product of products) {
    image ??= firstImage(product.image);
    if (price === null) ({ price, currency } = offerPrice(product.offers));
    if (image && price !== null) break;
  }

  const meta = metaTags(html);
  image ??= meta.get('og:image:secure_url') ?? meta.get('og:image') ?? meta.get('twitter:image') ?? meta.get('image') ?? null;
  if (price === null) {
    price = parsePrice(meta.get('product:price:amount') ?? meta.get('og:price:amount') ?? meta.get('price') ?? meta.get('twitter:data1'));
    if (price !== null) currency = normalizeCurrency(meta.get('product:price:currency') ?? meta.get('og:price:currency') ?? meta.get('pricecurrency') ?? meta.get('twitter:data1'));
  }

  const isProduct = products.length > 0 || /product/i.test(meta.get('og:type') ?? '') || price !== null;
  return { imageUrl: absoluteImageUrl(image, pageUrl), price, currency, isProduct };
}
