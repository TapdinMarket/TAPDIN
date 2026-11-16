import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, rateLimit } from '@/lib/auth';
import { db } from '@/lib/db';
import { detectMarketplace, parseHttpUrl } from '@/lib/marketplaces';
import { EVENT, orderNo, STATUS } from '@/lib/orders';
import { getCachedPreview } from '@/lib/product-preview';
import { isComingSoon, isOrderable } from '@/lib/regions';
import { storage } from '@/lib/storage';
import { MAX_IMAGES_PER_ORDER, sameOrigin, storeUpload, validateUpload } from '@/lib/uploads';

export const MAX_ITEMS = 20;
const MAX_IMAGES_TOTAL = 40;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const price = z
  .string()
  .trim()
  .max(20)
  .transform((v) => (v ? Number(v.replace(/\s/g, '').replace(',', '.')) : null))
  .refine((v) => v === null || (Number.isFinite(v) && v > 0 && v < 10_000_000));

const itemBase = {
  quantity: z.coerce.number().int().min(1).max(10_000),
  variant: optionalText(200),
  sizeColor: optionalText(200),
  note: optionalText(1000),
  /** Price the customer knows. Optional, informational, never used for pricing. */
  clientPrice: price,
  clientCurrency: optionalText(3),
};
const urlItem = z.object({
  ...itemBase,
  method: z.literal('URL'),
  sourceUrl: z.string().trim().max(2000).refine((v) => parseHttpUrl(v) !== null),
  title: z.string().trim().min(2).max(300),
});
const imageItem = z.object({
  ...itemBase,
  method: z.literal('IMAGE'),
  description: z.string().trim().min(3).max(2000),
});
const orderSchema = z.object({
  regionKey: optionalText(10),
  instructions: optionalText(2000),
});

const fail = (error: string, status = 400, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...extra }, { status });

/**
 * Create an order: one parcel with any number of items from ONE sourcing region (store links and photo requests can
 * be mixed). Items from different regions go to different warehouses, so they are refused here, whatever the client
 * sends. Orders for regions that are not ACTIVE (e.g. COMING_SOON) are refused too.
 *
 * Multipart fields: regionKey, instructions, itemCount, and per item i: items.i.method, items.i.sourceUrl,
 * items.i.title | items.i.description, items.i.variant, items.i.sizeColor, items.i.quantity, items.i.note,
 * items.i.clientPrice, items.i.clientCurrency, files items.i.images.
 */
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
  const text = (key: string) => {
    const v = form.get(key);
    return typeof v === 'string' ? v : '';
  };

  const orderFields = orderSchema.safeParse({ regionKey: text('regionKey'), instructions: text('instructions') });
  if (!orderFields.success) return fail('invalid');
  const count = Number(text('itemCount'));
  if (!Number.isInteger(count) || count < 1) return fail('invalid');
  if (count > MAX_ITEMS) return fail('too_many_items');

  const [regions, marketplaces, rates] = await Promise.all([
    db.region.findMany({ where: { enabled: true }, select: { key: true, enabled: true, status: true } }),
    db.marketplace.findMany({ where: { enabled: true } }),
    db.exchangeRate.findMany({ select: { currency: true } }),
  ]);
  const knownCurrency = (c: string | null) => !!c && (c === 'AZN' || rates.some((r) => r.currency === c));

  type Upload = Extract<Awaited<ReturnType<typeof validateUpload>>, { ok: true }>;
  const items: { data: Record<string, unknown>; uploads: Upload[] }[] = [];
  const detectedRegions = new Set<string>();
  let imageTotal = 0;

  for (let i = 0; i < count; i++) {
    const p = `items.${i}.`;
    const raw = {
      method: text(`${p}method`),
      sourceUrl: text(`${p}sourceUrl`),
      title: text(`${p}title`),
      description: text(`${p}description`),
      variant: text(`${p}variant`),
      sizeColor: text(`${p}sizeColor`),
      quantity: text(`${p}quantity`) || '1',
      note: text(`${p}note`),
      clientPrice: text(`${p}clientPrice`),
      clientCurrency: text(`${p}clientCurrency`),
    };
    const parsed = raw.method === 'IMAGE' ? imageItem.safeParse(raw) : urlItem.safeParse(raw);
    if (!parsed.success) return fail('invalid', 400, { item: i });

    const files = form.getAll(`${p}images`).filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length > MAX_IMAGES_PER_ORDER) return fail('too_many', 400, { item: i });
    imageTotal += files.length;
    if (imageTotal > MAX_IMAGES_TOTAL) return fail('too_many', 400, { item: i });
    const uploads: Upload[] = [];
    for (const file of files) {
      const result = await validateUpload(file, { image: true, video: false });
      if (!result.ok) return fail(result.error === 'size' ? 'file_size' : 'file_type', 400, { item: i });
      uploads.push(result);
    }
    if (parsed.data.method === 'IMAGE' && uploads.length === 0) return fail('no_image', 400, { item: i });

    const currency = parsed.data.clientCurrency?.toUpperCase() ?? null;
    const clientPrice = parsed.data.clientPrice !== null && knownCurrency(currency) ? parsed.data.clientPrice : null;
    const common = {
      position: i,
      method: parsed.data.method,
      variant: parsed.data.variant,
      sizeColor: parsed.data.sizeColor,
      quantity: parsed.data.quantity,
      note: parsed.data.note,
      clientPrice,
      clientCurrency: clientPrice === null ? null : currency,
    };

    if (parsed.data.method === 'URL') {
      const marketplace = detectMarketplace(parsed.data.sourceUrl, marketplaces);
      if (marketplace) detectedRegions.add(marketplace.regionKey);
      // Preview image/price are never read from the request: only a preview this server fetched itself.
      const preview = getCachedPreview(parsed.data.sourceUrl);
      const ok = preview?.status === 'ok' ? preview : null;
      items.push({
        uploads,
        data: {
          ...common,
          sourceUrl: parseHttpUrl(parsed.data.sourceUrl)!.toString(),
          sourceMarketplace: marketplace?.key ?? null,
          title: parsed.data.title,
          previewImageUrl: ok?.imageUrl ?? null,
          previewPrice: ok?.price ?? null,
          previewCurrency: ok?.currency ?? null,
        },
      });
    } else {
      items.push({ uploads, data: { ...common, description: parsed.data.description } });
    }
  }

  // One order = one region = one warehouse.
  if (orderFields.data.regionKey) detectedRegions.add(orderFields.data.regionKey);
  if (detectedRegions.size > 1) return fail('mixed_regions', 400, { regions: [...detectedRegions] });
  const regionKey = [...detectedRegions][0] ?? null;
  const region = regionKey ? regions.find((r) => r.key === regionKey) ?? null : null;
  if (isComingSoon(region)) return fail('region_coming_soon', 409);

  const order = await db.order.create({
    data: {
      userId: user.id, // always the session user, never a client-supplied id
      type: user.accountType === 'BUSINESS' ? 'B2B' : 'PERSONAL',
      regionKey: isOrderable(region) ? regionKey : null,
      instructions: orderFields.data.instructions,
      statusKey: STATUS.REQUEST_RECEIVED,
      events: { create: { description: EVENT.CREATED, status: STATUS.REQUEST_RECEIVED, actorId: user.id } },
    },
  });

  const storedKeys: string[] = [];
  try {
    for (const item of items) {
      const created = await db.orderItem.create({ data: { ...(item.data as object), orderId: order.id } as never });
      for (const upload of item.uploads) {
        const key = await storeUpload(order.id, upload.buffer, upload.type);
        storedKeys.push(key);
        await db.orderMedia.create({
          data: { orderId: order.id, itemId: created.id, storageKey: key, mimeType: upload.type.mime, sizeBytes: upload.buffer.length, kind: 'CUSTOMER_REFERENCE' },
        });
      }
    }
  } catch (error) {
    console.error('Order creation failed', error);
    await Promise.all(storedKeys.map((k) => storage().delete(k)));
    await db.order.delete({ where: { id: order.id } });
    return fail('upload_failed', 500);
  }

  return NextResponse.json({ id: order.id, number: orderNo(order.number) }, { status: 201 });
}
