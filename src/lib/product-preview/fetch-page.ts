import 'server-only';
import { lookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import zlib from 'node:zlib';
import { FetchError } from './core';
import { isPublicAddress } from './net-guard';
import { matchSource } from './sources';

const TIMEOUT_MS = 9_000;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 4;
// An honest identifier. We do not impersonate browsers or crawlers to get past bot protection.
const USER_AGENT = 'Mozilla/5.0 (compatible; TapdinPreview/1.0; product preview for a customer order)';

/** DNS lookup that refuses non-public addresses, so the connection itself can never reach an internal host
 *  (also closes the DNS-rebinding gap between "check" and "connect"). */
function safeLookup(
  hostname: string,
  options: { all?: boolean },
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
) {
  lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, '');
    const list = addresses as LookupAddress[];
    if (!list.length || list.some((a) => !isPublicAddress(a.address))) {
      return callback(Object.assign(new Error('blocked_address'), { code: 'EBLOCKED' }), '');
    }
    if (options.all) callback(null, list);
    else callback(null, list[0].address, list[0].family);
  });
}

function request(url: URL): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      url,
      {
        method: 'GET',
        lookup: safeLookup as never,
        timeout: TIMEOUT_MS,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'Accept-Language': 'en-US,en;q=0.8,ru;q=0.6',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, headers: res.headers, body: Buffer.alloc(0) });
        }
        const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
        const stream =
          encoding === 'gzip' ? res.pipe(zlib.createGunzip()) : encoding === 'deflate' ? res.pipe(zlib.createInflate()) : encoding === 'br' ? res.pipe(zlib.createBrotliDecompress()) : res;
        const chunks: Buffer[] = [];
        let size = 0;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve({ status, headers: res.headers, body: Buffer.concat(chunks) });
        };
        stream.on('data', (chunk: Buffer) => {
          size += chunk.length;
          chunks.push(chunk);
          // Enough to read the <head> and inline JSON-LD; stop downloading the rest.
          if (size >= MAX_BYTES) {
            finish();
            req.destroy();
          }
        });
        stream.on('end', finish);
        stream.on('error', (e) => (done ? undefined : reject(e)));
      },
    );
    req.on('timeout', () => req.destroy(new FetchError('timeout')));
    req.on('error', reject);
    req.end();
  });
}

/**
 * Fetches a product page from an allow-listed store. Every hop (including redirects) must stay on an
 * allow-listed host, use http(s) on the default port and resolve to public addresses only.
 */
export async function fetchProductPage(start: string): Promise<{ html: string; finalUrl: string }> {
  let url = new URL(start);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!matchSource(url.toString()) || isIP(url.hostname.replace(/^\[|\]$/g, ''))) throw new FetchError(hop ? 'redirect' : 'blocked');

    let res: Awaited<ReturnType<typeof request>>;
    try {
      res = await request(url);
    } catch (error) {
      if (error instanceof FetchError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      throw new FetchError(code === 'EBLOCKED' ? 'blocked' : 'network');
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.location;
      if (!location) throw new FetchError('http');
      const next = new URL(location, url);
      // Redirecting to the same page with a marker (e.g. ?__rr=1) means "run JavaScript / set a cookie first".
      if (next.origin === url.origin && next.pathname === url.pathname && hop >= 1) throw new FetchError('blocked');
      url = next;
      continue;
    }
    // 401/403/429 and friends: the store refused an automated request. We stop here; no workarounds.
    if ([401, 403, 429, 498, 503].includes(res.status)) throw new FetchError('blocked');
    if (res.status < 200 || res.status >= 300) throw new FetchError('http');
    const type = String(res.headers['content-type'] ?? '');
    if (type && !/html|xml/i.test(type)) throw new FetchError('not_html');
    return { html: res.body.toString('utf8'), finalUrl: url.toString() };
  }
  throw new FetchError('redirect');
}
