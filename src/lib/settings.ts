import 'server-only';
import { cache } from 'react';
import { z } from 'zod';
import { db } from './db';

export const settingSchemas = {
  general: z.object({
    quoteValidityDays: z.number().int().min(1).max(60),
    commissionBasis: z.enum(['PRODUCT', 'PRODUCT_AND_DOMESTIC', 'SUBTOTAL']),
    /** Extra fee staff may add for hard-to-find products. */
    sourcingFeeAzn: z.number().min(0),
  }),
  contact: z.object({
    phone: z.string().max(40),
    whatsapp: z.string().max(40),
    email: z.string().max(120),
    instagram: z.string().max(80),
    address: z.string().max(200),
  }),
  payment: z.object({
    /** Shown to customers after they accept a quotation (bank details, card number for transfer...). */
    instructions: z.string().max(2000),
  }),
  customs: z.object({
    /** Reference text for staff and customers. Must be reviewed against current Azerbaijani regulations. */
    note: z.string().max(2000),
  }),
};

export type Settings = { [K in keyof typeof settingSchemas]: z.infer<(typeof settingSchemas)[K]> };

export const settingDefaults: Settings = {
  general: { quoteValidityDays: 3, commissionBasis: 'PRODUCT', sourcingFeeAzn: 10 },
  contact: {
    phone: '+994 00 000 00 00',
    whatsapp: '994000000000',
    email: 'support@tapdiq.az',
    instagram: 'tapdiq.az',
    address: 'Bakı, Azərbaycan',
  },
  payment: {
    instructions:
      'Ödəniş hazırda bank köçürməsi və ya kartdan-karta köçürmə ilə qəbul olunur. Rekvizitlər üçün dəstək xidməti ilə əlaqə saxlayın.',
  },
  customs: {
    note: 'Gömrük rüsumları və limitlər qüvvədə olan Azərbaycan qanunvericiliyinə əsasən hər sifariş üçün ayrıca qiymətləndirilir.',
  },
};

export const getSettings = cache(async (): Promise<Settings> => {
  const rows = await db.setting.findMany();
  const result = structuredClone(settingDefaults);
  for (const row of rows) {
    const key = row.key as keyof Settings;
    const schema = settingSchemas[key];
    if (!schema) continue;
    const parsed = schema.safeParse(row.value);
    if (parsed.success) (result as Record<string, unknown>)[key] = parsed.data;
  }
  return result;
});

export async function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  const data = settingSchemas[key].parse(value) as object;
  await db.setting.upsert({ where: { key }, create: { key, value: data }, update: { value: data } });
}

/** Regions, marketplaces and exchange rates as plain serialisable objects. */
export const getCatalog = cache(async () => {
  const [regions, marketplaces, rates] = await Promise.all([
    db.region.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.marketplace.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.exchangeRate.findMany({ orderBy: { currency: 'asc' } }),
  ]);
  return {
    regions: regions.map((r) => ({
      key: r.key,
      name: r.name,
      enabled: r.enabled,
      defaultCurrency: r.defaultCurrency,
      commissionPercent: Number(r.commissionPercent),
      minCommissionAzn: Number(r.minCommissionAzn),
      cargoPerKgUsd: Number(r.cargoPerKgUsd),
      minBillableWeightKg: Number(r.minBillableWeightKg),
      customsNote: r.customsNote ?? '',
      sortOrder: r.sortOrder,
    })),
    marketplaces: marketplaces.map((m) => ({
      key: m.key,
      name: m.name,
      regionKey: m.regionKey,
      hostPatterns: m.hostPatterns,
      enabled: m.enabled,
      sortOrder: m.sortOrder,
    })),
    rates: rates.map((r) => ({ currency: r.currency, rateToAzn: Number(r.rateToAzn), updatedAt: r.updatedAt })),
  };
});

export type Catalog = Awaited<ReturnType<typeof getCatalog>>;
