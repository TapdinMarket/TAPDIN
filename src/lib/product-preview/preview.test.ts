import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FetchError, previewOrderFields, previewProduct, type FetchHtml } from './core.ts';
import { isPublicAddress } from './net-guard.ts';
import { looksLikeWall, normalizeCurrency, parsePrice, parseProductHtml } from './parse.ts';
import { matchSource } from './sources.ts';

const TEMU_URL = 'https://www.temu.com/goods-detail-g-601099000000001.html';

// Shape of a product page that publishes schema.org data (as stores do for search engines).
const jsonLdPage = `<!doctype html><html><head><title>LED desk lamp</title>
<meta property="og:image" content="https://img.example-cdn.com/og-fallback.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"LED desk lamp",
"image":["https://img.kwcdn.com/product/lamp-1.jpg","https://img.kwcdn.com/product/lamp-2.jpg"],
"offers":{"@type":"Offer","price":"12.99","priceCurrency":"USD"}}</script></head><body></body></html>`;

const ogPage = `<html><head><title>Чайник</title>
<meta property="og:type" content="product">
<meta property="og:image" content="//cdn.example.ru/kettle.jpg?w=800&amp;h=800">
<meta property="product:price:amount" content="1 299,00">
<meta property="product:price:currency" content="RUB"></head></html>`;

const fixed = (html: string, finalUrl = TEMU_URL): FetchHtml => async () => ({ html, finalUrl });
const failing = (kind: ConstructorParameters<typeof FetchError>[0]): FetchHtml => async () => {
  throw new FetchError(kind);
};

test('successful recognition: first image and original price from JSON-LD', async () => {
  const result = await previewProduct(TEMU_URL, fixed(jsonLdPage));
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.deepEqual(result.source, { key: 'temu', name: 'Temu' });
  assert.equal(result.imageUrl, 'https://img.kwcdn.com/product/lamp-1.jpg');
  assert.equal(result.price, 12.99);
  assert.equal(result.currency, 'USD');
  assert.equal(result.productUrl, TEMU_URL);
});

test('falls back to Open Graph product tags, resolves protocol-relative images, reads "1 299,00"', () => {
  const parsed = parseProductHtml(ogPage, 'https://www.ozon.ru/product/kettle-1/');
  assert.equal(parsed.imageUrl, 'https://cdn.example.ru/kettle.jpg?w=800&h=800');
  assert.equal(parsed.price, 1299);
  assert.equal(parsed.currency, 'RUB');
});

test('unsupported link: no request is made for hosts outside the allow-list', async () => {
  let called = false;
  const spy: FetchHtml = async () => {
    called = true;
    return { html: jsonLdPage, finalUrl: '' };
  };
  for (const url of ['https://example-shop.com/p/1', 'http://localhost:3000/', 'http://127.0.0.1/', 'https://temu.com.evil.example/x', 'https://user:pass@temu.com/x', 'https://temu.com:8443/x']) {
    const result = await previewProduct(url, spy);
    assert.equal(result.status, 'unsupported', url);
  }
  assert.equal((await previewProduct('not a url', spy)).status, 'invalid');
  assert.equal((await previewProduct('ftp://temu.com/x', spy)).status, 'invalid');
  assert.equal(called, false);
});

test('extraction error: blocked or failing store pages become "unavailable", never fake data', async () => {
  const blocked = await previewProduct(TEMU_URL, failing('blocked'));
  assert.deepEqual(blocked, { status: 'unavailable', source: { key: 'temu', name: 'Temu' }, reason: 'blocked' });
  const timeout = await previewProduct(TEMU_URL, failing('timeout'));
  assert.equal(timeout.status === 'unavailable' && timeout.reason, 'timeout');
  const crashed = await previewProduct(TEMU_URL, async () => {
    throw new Error('socket hang up');
  });
  assert.equal(crashed.status === 'unavailable' && crashed.reason, 'network');

  // A bot challenge served with HTTP 200 is recognised as blocked, too.
  const challenge = '<html><body><script>var _0x1=["challenge","https://static.example/chl.js"];</script></body></html>';
  assert.equal(looksLikeWall(challenge), true);
  const walled = await previewProduct(TEMU_URL, fixed(challenge));
  assert.equal(walled.status === 'unavailable' && walled.reason, 'blocked');
});

test('a page without product data is "not_found"; a logo on a non-product page is not used', async () => {
  const empty = await previewProduct(TEMU_URL, fixed('<html><head><title>Temu | Shop</title></head><body>Hello</body></html>'));
  assert.equal(empty.status, 'not_found');
  const logoOnly = await previewProduct(TEMU_URL, fixed('<html><head><title>Shop</title><meta property="og:image" content="https://cdn.example.com/logo.png"></head></html>'));
  assert.equal(logoOnly.status, 'not_found');
});

test('manual continuation: an order without a usable preview stores no preview fields', () => {
  const none = { previewImageUrl: null, previewPrice: null, previewCurrency: null, previewFetchedAt: null };
  assert.deepEqual(previewOrderFields(null), none);
  assert.deepEqual(previewOrderFields({ status: 'unavailable', source: { key: 'temu', name: 'Temu' }, reason: 'blocked' }), none);
  assert.deepEqual(previewOrderFields({ status: 'unsupported' }), none);
  const ok = previewOrderFields({ status: 'ok', source: { key: 'temu', name: 'Temu' }, productUrl: TEMU_URL, imageUrl: 'https://img/x.jpg', price: 5, currency: 'USD' });
  assert.equal(ok.previewPrice, 5);
  assert.ok(ok.previewFetchedAt instanceof Date);
});

test('price and currency formats', () => {
  const cases: [unknown, number | null][] = [
    [29.99, 29.99], ['29.99', 29.99], ['1,299.00', 1299], ['1.299,50', 1299.5], ['1 299,00 ₽', 1299], ['12,99 €', 12.99],
    ['¥268', 268], ['US$ 1,299', 1299], ['2.999', 2999], ['0.990', 0.99], ['10-20', null], ['free', null], [-5, null], ['', null],
  ];
  for (const [input, expected] of cases) assert.equal(parsePrice(input), expected, String(input));
  assert.equal(normalizeCurrency('rub'), 'RUB');
  assert.equal(normalizeCurrency('RUR'), 'RUB');
  assert.equal(normalizeCurrency('₽'), 'RUB');
  assert.equal(normalizeCurrency('¥'), 'CNY');
  assert.equal(normalizeCurrency('US$'), 'USD');
  assert.equal(normalizeCurrency(undefined), null);
});

test('SSRF guard: only public addresses are reachable', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '224.0.0.1']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of ['93.184.215.14', '8.8.8.8', '2606:4700::6810:84e5', '::ffff:8.8.8.8']) assert.equal(isPublicAddress(ip), true, ip);
});

test('store detection covers subdomains but not look-alikes', () => {
  assert.equal(matchSource('https://www.temu.com/x.html')?.key, 'temu');
  assert.equal(matchSource('https://share.temu.com/abc')?.key, 'temu');
  assert.equal(matchSource('https://detail.1688.com/offer/1.html')?.key, '1688');
  assert.equal(matchSource('https://www.wildberries.ru/catalog/1/detail.aspx')?.key, 'wildberries');
  assert.equal(matchSource('https://faketemu.com/x'), null);
  assert.equal(matchSource('https://temu.com.attacker.io/x'), null);
});
