import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, rateLimit } from '@/lib/auth';
import { db } from '@/lib/db';
import { getProductExtractor } from '@/lib/integrations';
import { detectMarketplace, parseHttpUrl } from '@/lib/marketplaces';
import { EVENT, orderNo, STATUS } from '@/lib/orders';
import { storage } from '@/lib/storage';
import { MAX_IMAGES_PER_ORDER, sameOrigin, storeUpload, validateUpload } from '@/lib/uploads';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const common = {
  quantity: z.coerce.number().int().min(1).max(10_000),
  sizeColor: optionalText(200),
  instructions: optionalText(2000),
  regionKey: optionalText(10),
};

const urlSchema = z.object({
  ...common,
  sourceUrl: z.string().trim().max(2000).refine((v) => parseHttpUrl(v) !== null),
  productTitle: z.string().trim().min(2).max(300),
  variant: optionalText(200),
});

const imageSchema = z.object({
  ...common,
  description: z.string().trim().min(3).max(2000),
});

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Create an order request. Works with or without marketplace detection; nothing is auto-extracted. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail('unauthorized', 401);
  if (!sameOrigin(request)) return fail('forbidden', 403);
  if (!rateLimit(`order:${user.id}`, 20, 60 * 60_000)) return fail('rate', 429);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('invalid');
  }
  const fields: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string') fields[k] = v;
  for (const k of ['sizeColor', 'instructions', 'regionKey', 'variant']) fields[k] ??= '';

  const method = fields.method === 'IMAGE' ? 'IMAGE' : 'URL';
  const regions = await db.region.findMany({ where: { enabled: true }, select: { key: true } });
  const validRegion = (key: string | null) => (key && regions.some((r) => r.key === key) ? key : null);

  let data: {
    sourceUrl: string | null;
    sourceMarketplace: string | null;
    regionKey: string | null;
    productTitle: string | null;
    productDescription: string | null;
    variant: string | null;
    sizeColor: string | null;
    instructions: string | null;
    quantity: number;
  };
  const uploads: Awaited<ReturnType<typeof validateUpload>>[] = [];

  if (method === 'URL') {
    const parsed = urlSchema.safeParse(fields);
    if (!parsed.success) return fail('invalid');
    const marketplaces = await db.marketplace.findMany({ where: { enabled: true } });
    const marketplace = detectMarketplace(parsed.data.sourceUrl, marketplaces);

    // Integration port: today this always reports "unavailable" and staff review the link manually.
    // We never store extracted data unless an adapter really returned it.
    const extraction = await getProductExtractor(marketplace?.key ?? null).extract(parsed.data.sourceUrl);

    data = {
      sourceUrl: parseHttpUrl(parsed.data.sourceUrl)!.toString(),
      sourceMarketplace: marketplace?.key ?? null,
      regionKey: validRegion(marketplace?.regionKey ?? parsed.data.regionKey),
      productTitle: parsed.data.productTitle,
      productDescription: extraction.status === 'ok' ? extraction.title : null,
      variant: parsed.data.variant,
      sizeColor: parsed.data.sizeColor,
      instructions: parsed.data.instructions,
      quantity: parsed.data.quantity,
    };
  } else {
    const parsed = imageSchema.safeParse(fields);
    if (!parsed.success) return fail('invalid');
    const files = form.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return fail('no_image');
    if (files.length > MAX_IMAGES_PER_ORDER) return fail('too_many');
    for (const file of files) {
      const result = await validateUpload(file, { image: true, video: false });
      if (!result.ok) return fail(result.error === 'size' ? 'file_size' : 'file_type');
      uploads.push(result);
    }
    data = {
      sourceUrl: null,
      sourceMarketplace: null,
      regionKey: validRegion(parsed.data.regionKey),
      productTitle: null,
      productDescription: parsed.data.description,
      variant: null,
      sizeColor: parsed.data.sizeColor,
      instructions: parsed.data.instructions,
      quantity: parsed.data.quantity,
    };
  }

  const order = await db.order.create({
    data: {
      ...data,
      userId: user.id, // always the session user, never a client-supplied id
      type: user.accountType === 'BUSINESS' ? 'B2B' : 'PERSONAL',
      method,
      statusKey: STATUS.REQUEST_RECEIVED,
      events: { create: { description: EVENT.CREATED, status: STATUS.REQUEST_RECEIVED, actorId: user.id } },
    },
  });

  const storedKeys: string[] = [];
  try {
    for (const upload of uploads) {
      if (!upload.ok) continue;
      const key = await storeUpload(order.id, upload.buffer, upload.type);
      storedKeys.push(key);
      await db.orderMedia.create({
        data: { orderId: order.id, storageKey: key, mimeType: upload.type.mime, sizeBytes: upload.buffer.length, kind: 'CUSTOMER_REFERENCE' },
      });
    }
  } catch (error) {
    console.error('Order upload failed', error);
    await Promise.all(storedKeys.map((k) => storage().delete(k)));
    await db.order.delete({ where: { id: order.id } });
    return fail('upload_failed', 500);
  }

  return NextResponse.json({ id: order.id, number: orderNo(order.number) }, { status: 201 });
}
