// Probe real store pages through the same SSRF-safe fetcher the app uses: npx tsx scripts/probe-preview.mts <url> [...]
import Module from 'node:module';
const req = Module.createRequire(import.meta.url);
(req.cache as any)[req.resolve('server-only')] = { exports: {} } as any;
const { fetchProductPage } = await import('../src/lib/product-preview/fetch-page.ts');
const { previewProduct } = await import('../src/lib/product-preview/core.ts');
for (const url of process.argv.slice(2)) {
  const t = Date.now();
  const r = await previewProduct(url, async (u) => { const p = await fetchProductPage(u); console.log('  bytes', p.html.length, 'final', p.finalUrl.slice(0, 90), '| title:', (p.html.match(/<title[^>]*>([^<]{0,80})/i)?.[1] ?? '').trim()); return p; });
  console.log(url.slice(0, 70), '→', JSON.stringify(r).slice(0, 300), `${Date.now() - t}ms`);
}
