import { NextResponse } from 'next/server';
import { getCurrentUser, isStaff } from '@/lib/auth';
import { db } from '@/lib/db';
import { EVENT } from '@/lib/orders';
import { sameOrigin, storeUpload, validateUpload } from '@/lib/uploads';

/** Staff upload of inspection photos/videos for an order. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isStaff(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await params;
  const order = await db.order.findUnique({ where: { id }, select: { id: true } });
  if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0 || files.length > 10) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  // Validate everything before storing anything.
  const valid = [];
  for (const file of files) {
    const result = await validateUpload(file, { image: true, video: true });
    if (!result.ok) return NextResponse.json({ error: result.error === 'size' ? 'file_size' : 'file_type' }, { status: 400 });
    valid.push(result);
  }

  for (const upload of valid) {
    const key = await storeUpload(order.id, upload.buffer, upload.type);
    await db.orderMedia.create({
      data: {
        orderId: order.id,
        storageKey: key,
        mimeType: upload.type.mime,
        sizeBytes: upload.buffer.length,
        kind: upload.type.kind === 'video' ? 'INSPECTION_VIDEO' : 'INSPECTION_PHOTO',
      },
    });
  }
  await db.orderEvent.create({ data: { orderId: order.id, description: EVENT.INSPECTION_ADDED, actorId: user.id } });

  return NextResponse.json({ ok: true, count: valid.length }, { status: 201 });
}
