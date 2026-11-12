import { getCurrentUser, isStaff } from '@/lib/auth';
import { db } from '@/lib/db';
import { storage } from '@/lib/storage';

/** Serves order media only to the order owner or staff. Supports Range requests for video playback. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const media = await db.orderMedia.findUnique({ where: { id }, include: { order: { select: { userId: true } } } });
  // 404 (not 403) so that media ids of other customers cannot be probed.
  if (!media || (media.order.userId !== user.id && !isStaff(user))) return new Response('Not found', { status: 404 });

  const data = await storage().get(media.storageKey);
  if (!data) return new Response('Not found', { status: 404 });

  const headers: Record<string, string> = {
    'Content-Type': media.mimeType,
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
    'Accept-Ranges': 'bytes',
  };

  const range = request.headers.get('range')?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    const size = data.length;
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    const chunk = data.subarray(start, end + 1);
    return new Response(new Uint8Array(chunk), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(chunk.length) },
    });
  }

  return new Response(new Uint8Array(data), { headers: { ...headers, 'Content-Length': String(data.length) } });
}
