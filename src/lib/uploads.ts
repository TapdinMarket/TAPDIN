import 'server-only';
import { randomBytes } from 'node:crypto';
import { storage } from './storage';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
export const MAX_IMAGES_PER_ORDER = 6;

type Sniffed = { mime: string; ext: string; kind: 'image' | 'video' };

/** Detect the real file type from magic bytes. The browser-supplied MIME type is never trusted. */
export function sniff(buf: Buffer): Sniffed | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg', kind: 'image' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { mime: 'image/png', ext: 'png', kind: 'image' };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return { mime: 'image/webp', ext: 'webp', kind: 'image' };
  if (buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (brand.startsWith('qt')) return { mime: 'video/quicktime', ext: 'mov', kind: 'video' };
    if (/^(isom|iso2|mp41|mp42|avc1|M4V |MSNV|dash)/.test(brand)) return { mime: 'video/mp4', ext: 'mp4', kind: 'video' };
    return null; // HEIC/AVIF and others are not accepted
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3)
    return { mime: 'video/webm', ext: 'webm', kind: 'video' };
  return null;
}

export type UploadError = 'type' | 'size';

export async function validateUpload(
  file: File,
  allow: { image: boolean; video: boolean },
): Promise<{ ok: true; buffer: Buffer; type: Sniffed } | { ok: false; error: UploadError }> {
  if (file.size > MAX_VIDEO_BYTES) return { ok: false, error: 'size' };
  const buffer = Buffer.from(await file.arrayBuffer());
  const type = sniff(buffer);
  if (!type || !allow[type.kind]) return { ok: false, error: 'type' };
  const limit = type.kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (buffer.length > limit) return { ok: false, error: 'size' };
  return { ok: true, buffer, type };
}

export async function storeUpload(orderId: string, buffer: Buffer, type: Sniffed) {
  const key = `orders/${orderId}/${randomBytes(16).toString('hex')}.${type.ext}`;
  await storage().put(key, buffer, type.mime);
  return key;
}

/** Same-origin check for cookie-authenticated POST route handlers. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // non-browser clients; the session cookie is SameSite=Lax anyway
  try {
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
