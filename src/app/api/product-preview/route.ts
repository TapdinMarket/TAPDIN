import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, rateLimit } from '@/lib/auth';
import { getProductPreview } from '@/lib/product-preview';
import { sameOrigin } from '@/lib/uploads';

const bodySchema = z.object({ url: z.string().trim().min(8).max(2000) });

/**
 * Photo + price preview for a product link. Signed-in customers only (the order form requires an account),
 * same-origin, rate-limited. Only allow-listed store hosts are ever requested; see lib/product-preview.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!rateLimit(`preview:${user.id}`, 30, 10 * 60_000)) return NextResponse.json({ error: 'rate' }, { status: 429 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ status: 'invalid' }, { status: 400 });

  const result = await getProductPreview(parsed.data.url);
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
