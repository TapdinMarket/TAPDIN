/**
 * Seed: reference data (always upserted) + clearly fictional demo customers/orders (only on an empty DB).
 * Run with: npm run db:seed
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { calculateOrderQuote } from '../src/lib/pricing/engine';

// Minimal .env loader so the seed works when started directly through tsx.
try {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
} catch {
  /* no .env file */
}

const db = new PrismaClient();

const statuses = [
  ['request_received', 'Sorğu qəbul edildi', 'Заявка принята', 'Request received', true, true],
  ['price_calculation', 'Qiymət hesablanır', 'Расчёт цены', 'Price calculation', true, true],
  ['awaiting_approval', 'Təsdiqinizi gözləyir', 'Ожидает подтверждения клиента', 'Awaiting customer approval', true, true],
  ['awaiting_payment', 'Ödəniş gözlənilir', 'Ожидает оплаты', 'Awaiting payment', true, true],
  ['purchase_confirmed', 'Alış təsdiqləndi', 'Покупка подтверждена', 'Purchase confirmed', true, true],
  ['origin_warehouse', 'Mənbə ölkədəki anbara çatdı', 'Прибыл на склад в стране покупки', 'Arrived at origin warehouse', false, true],
  ['quality_inspection', 'Keyfiyyət yoxlaması', 'Проверка качества', 'Quality inspection', false, true],
  ['ready_to_ship', 'Beynəlxalq göndərişə hazırdır', 'Готов к международной отправке', 'Ready for international shipment', false, true],
  ['in_transit', 'Yoldadır', 'В пути', 'In transit', false, true],
  ['customs', 'Gömrük rəsmiləşdirilməsi', 'Таможенное оформление', 'Customs processing', false, true],
  ['arrived_az', 'Azərbaycana çatdı', 'Прибыл в Азербайджан', 'Arrived in Azerbaijan', false, true],
  ['ready_for_pickup', 'Təhvil / çatdırılmaya hazırdır', 'Готов к выдаче / доставке', 'Ready for pickup / delivery', false, true],
  ['completed', 'Tamamlandı', 'Завершён', 'Completed', true, true],
  ['cancelled', 'Ləğv edildi', 'Отменён', 'Cancelled', true, false],
  // Delays: shown to the customer as a notice (and notified), not as a step of the timeline.
  ['cargo_delayed', 'Karqoda gecikmə', 'Задержка у карго', 'Delayed by the carrier', false, false],
  ['customs_hold', 'Gömrükdə gecikmə', 'Задержка на таможне', 'Held at customs', false, false],
  ['lost', 'Bağlama itib — araşdırırıq', 'Посылка утеряна — разбираемся', 'Parcel lost — investigating', false, false],
] as const;

const regions = [
  { key: 'CN', name: 'Çin', defaultCurrency: 'CNY', commissionPercent: 15, minCommissionAzn: 5, cargoPerKgUsd: 6, minBillableWeightKg: 0.5 },
  // Russia: placeholder rates like the others — verify cargo cost and customs rules before going live.
  { key: 'RU', name: 'Rusiya', defaultCurrency: 'RUB', commissionPercent: 15, minCommissionAzn: 5, cargoPerKgUsd: 4, minBillableWeightKg: 0.5 },
  // USA and Europe are announced (COMING_SOON): visible on the site, closed for orders.
  { key: 'US', name: 'ABŞ', status: 'COMING_SOON' as const, defaultCurrency: 'USD', commissionPercent: 15, minCommissionAzn: 8, cargoPerKgUsd: 9, minBillableWeightKg: 0.5 },
  { key: 'EU', name: 'Avropa', status: 'COMING_SOON' as const, defaultCurrency: 'EUR', commissionPercent: 15, minCommissionAzn: 8, cargoPerKgUsd: 8, minBillableWeightKg: 0.5 },
];

const marketplaces = [
  { key: '1688', name: '1688', regionKey: 'CN', hostPatterns: ['1688.com'] },
  { key: 'taobao', name: 'Taobao', regionKey: 'CN', hostPatterns: ['taobao.com', 'tmall.com', 'tb.cn'] },
  { key: 'pinduoduo', name: 'Pinduoduo', regionKey: 'CN', hostPatterns: ['pinduoduo.com', 'yangkeduo.com'] },
  { key: 'temu', name: 'Temu', regionKey: 'CN', hostPatterns: ['temu.com'] },
  { key: 'ozon', name: 'Ozon', regionKey: 'RU', hostPatterns: ['ozon.ru'] },
  { key: 'wildberries', name: 'Wildberries', regionKey: 'RU', hostPatterns: ['wildberries.ru', 'wb.ru'] },
  // US / EU stores (regions COMING_SOON): recognising them lets the order form say "coming soon" instead of failing later.
  { key: 'amazon_us', name: 'Amazon', regionKey: 'US', hostPatterns: ['amazon.com'] },
  { key: 'ebay', name: 'eBay', regionKey: 'US', hostPatterns: ['ebay.com'] },
  { key: 'walmart', name: 'Walmart', regionKey: 'US', hostPatterns: ['walmart.com'] },
  { key: 'bestbuy', name: 'Best Buy', regionKey: 'US', hostPatterns: ['bestbuy.com'] },
  { key: 'amazon_eu', name: 'Amazon EU', regionKey: 'EU', hostPatterns: ['amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.nl', 'amazon.pl', 'amazon.se'] },
  { key: 'zalando', name: 'Zalando', regionKey: 'EU', hostPatterns: ['zalando.de', 'zalando.fr', 'zalando.it', 'zalando.es', 'zalando.nl', 'zalando.pl', 'zalando.at', 'zalando.be'] },
  { key: 'otto', name: 'OTTO', regionKey: 'EU', hostPatterns: ['otto.de'] },
];

// Demo defaults only — the admin must maintain real rates in Settings.
const rates = { USD: 1.7, EUR: 1.85, CNY: 0.235, GBP: 2.15, RUB: 0.021 };

async function seedReference() {
  for (const [i, s] of statuses.entries()) {
    const [key, labelAz, labelRu, labelEn, isSystem, showOnTimeline] = s;
    await db.orderStatus.upsert({
      where: { key },
      create: { key, labelAz, labelRu, labelEn, sortOrder: ({ cargo_delayed: 95, customs_hold: 105, lost: 106 } as Record<string, number>)[key] ?? (i + 1) * 10, isSystem, showOnTimeline },
      update: {},
    });
  }
  for (const [i, r] of regions.entries()) {
    await db.region.upsert({
      where: { key: r.key },
      create: {
        ...r,
        sortOrder: i,
        customsNote: 'Gömrük limitləri və rüsumları qüvvədə olan qanunvericiliyə əsasən yoxlanılmalıdır.',
      },
      update: {},
    });
  }
  for (const [i, m] of marketplaces.entries()) {
    await db.marketplace.upsert({ where: { key: m.key }, create: { ...m, sortOrder: i }, update: {} });
  }
  // One-off upgrades for databases seeded before Russia was added. Only untouched defaults are changed.
  await db.orderStatus.updateMany({
    where: { key: 'origin_warehouse', labelEn: 'Arrived at China warehouse' },
    data: { labelAz: 'Mənbə ölkədəki anbara çatdı', labelRu: 'Прибыл на склад в стране покупки', labelEn: 'Arrived at origin warehouse' },
  });
  await db.region.updateMany({ where: { key: 'EU', sortOrder: 2 }, data: { sortOrder: 3 } });
  await db.region.updateMany({ where: { key: 'US', sortOrder: 1 }, data: { sortOrder: 2 } });
  for (const [currency, rateToAzn] of Object.entries(rates)) {
    await db.exchangeRate.upsert({ where: { currency }, create: { currency, rateToAzn }, update: {} });
  }
}

async function seedUsers() {
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@tapdin.az').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const customerEmail = (process.env.SEED_CUSTOMER_EMAIL ?? 'leyla@example.com').toLowerCase();
  const customerPassword = process.env.SEED_CUSTOMER_PASSWORD;
  if (!adminPassword || !customerPassword) {
    throw new Error('Set SEED_ADMIN_PASSWORD and SEED_CUSTOMER_PASSWORD in .env before seeding (see .env.example).');
  }

  const admin = await db.user.upsert({
    where: { email: adminEmail },
    create: { name: 'Admin', email: adminEmail, phone: '+994000000000', role: 'ADMIN', passwordHash: await bcrypt.hash(adminPassword, 12) },
    update: {},
  });
  const customerHash = await bcrypt.hash(customerPassword, 12);
  const demo = [
    { name: 'Leyla Məmmədova (demo)', email: customerEmail, phone: '+994500000001' },
    { name: 'Rəşad Əliyev (demo)', email: 'rashad@example.com', phone: '+994500000002' },
    { name: 'Nigar Həsənova (demo)', email: 'nigar@example.com', phone: '+994500000003' },
  ];
  const customers = [];
  for (const c of demo) {
    customers.push(await db.user.upsert({ where: { email: c.email }, create: { ...c, passwordHash: customerHash }, update: {} }));
  }
  return { admin, customers };
}

type Demo = {
  customer: number;
  monthsAgo: number;
  market: string | null;
  region: 'CN' | 'RU' | 'US' | 'EU';
  url: string | null;
  title: string;
  sizeColor?: string;
  qty: number;
  status: string;
  quote?: { currency: 'CNY' | 'RUB' | 'USD' | 'EUR'; unit: number; domestic: number; weight: number; state: 'SENT' | 'ACCEPTED' | 'REJECTED' };
  paid?: boolean;
  tracking?: boolean;
};

const demoOrders: Demo[] = [
  { customer: 0, monthsAgo: 5, market: 'taobao', region: 'CN', url: 'https://item.taobao.com/item.htm?id=000000000001', title: 'Keramika çay dəsti, 6 nəfərlik', qty: 1, status: 'completed', quote: { currency: 'CNY', unit: 268, domestic: 12, weight: 2.4, state: 'ACCEPTED' }, paid: true, tracking: true },
  { customer: 1, monthsAgo: 5, market: '1688', region: 'CN', url: 'https://detail.1688.com/offer/000000000002.html', title: 'LED masa lampası, minimalist', sizeColor: 'ağ', qty: 2, status: 'completed', quote: { currency: 'CNY', unit: 89, domestic: 8, weight: 1.6, state: 'ACCEPTED' }, paid: true, tracking: true },
  { customer: 2, monthsAgo: 4, market: null, region: 'US', url: 'https://example-outdoor-store.com/products/camp-mug', title: 'Titan kamp fincanı 450 ml', qty: 2, status: 'completed', quote: { currency: 'USD', unit: 34, domestic: 6, weight: 0.5, state: 'ACCEPTED' }, paid: true, tracking: true },
  { customer: 0, monthsAgo: 3, market: 'pinduoduo', region: 'CN', url: 'https://mobile.yangkeduo.com/goods.html?goods_id=000000000004', title: 'Uşaq üçün taxta konstruktor', qty: 1, status: 'completed', quote: { currency: 'CNY', unit: 145, domestic: 0, weight: 1.9, state: 'ACCEPTED' }, paid: true, tracking: true },
  { customer: 1, monthsAgo: 3, market: 'taobao', region: 'CN', url: 'https://item.taobao.com/item.htm?id=000000000005', title: 'Mexaniki klaviatura 75%', sizeColor: 'boz, qəhvəyi switch', qty: 1, status: 'completed', quote: { currency: 'CNY', unit: 399, domestic: 0, weight: 1.2, state: 'ACCEPTED' }, paid: true, tracking: true },
  { customer: 2, monthsAgo: 2, market: null, region: 'EU', url: 'https://example-atelier.eu/shop/linen-apron', title: 'Kətan mətbəx önlüyü', sizeColor: 'zeytun', qty: 1, status: 'completed', quote: { currency: 'EUR', unit: 48, domestic: 7, weight: 0.4, state: 'ACCEPTED' }, paid: true, tracking: true },
  { customer: 0, monthsAgo: 2, market: '1688', region: 'CN', url: 'https://detail.1688.com/offer/000000000007.html', title: 'Divar rəfi, palıd', qty: 3, status: 'cancelled', quote: { currency: 'CNY', unit: 120, domestic: 25, weight: 7.5, state: 'REJECTED' } },
  { customer: 1, monthsAgo: 1, market: 'taobao', region: 'CN', url: 'https://item.taobao.com/item.htm?id=000000000008', title: 'Səyahət bel çantası 35 L', sizeColor: 'qara', qty: 1, status: 'in_transit', quote: { currency: 'CNY', unit: 310, domestic: 10, weight: 1.3, state: 'ACCEPTED' }, paid: true, tracking: true },
  { customer: 2, monthsAgo: 1, market: null, region: 'US', url: 'https://example-audio-shop.com/p/studio-headphones', title: 'Studiya qulaqlığı', qty: 1, status: 'customs', quote: { currency: 'USD', unit: 129, domestic: 0, weight: 0.8, state: 'ACCEPTED' }, paid: true, tracking: true },
  { customer: 0, monthsAgo: 0, market: 'taobao', region: 'CN', url: 'https://item.taobao.com/item.htm?id=000000000010', title: 'Yun palto, oversize', sizeColor: 'M, bej', qty: 1, status: 'quality_inspection', quote: { currency: 'CNY', unit: 520, domestic: 0, weight: 1.5, state: 'ACCEPTED' }, paid: true },
  { customer: 0, monthsAgo: 0, market: '1688', region: 'CN', url: 'https://detail.1688.com/offer/000000000011.html', title: 'Qəhvə dəyirmanı, əl ilə', qty: 1, status: 'awaiting_approval', quote: { currency: 'CNY', unit: 178, domestic: 9, weight: 0.9, state: 'SENT' } },
  { customer: 1, monthsAgo: 0, market: 'pinduoduo', region: 'CN', url: 'https://mobile.yangkeduo.com/goods.html?goods_id=000000000012', title: 'Simsiz tozsoran üçün filtr dəsti', qty: 4, status: 'awaiting_payment', quote: { currency: 'CNY', unit: 32, domestic: 6, weight: 0.6, state: 'ACCEPTED' } },
  { customer: 1, monthsAgo: 2, market: 'ozon', region: 'RU', url: 'https://www.ozon.ru/product/000000000015/', title: 'Emallı çuqun qazan 4 L', qty: 1, status: 'completed', quote: { currency: 'RUB', unit: 4200, domestic: 0, weight: 4.1, state: 'ACCEPTED' }, paid: true, tracking: true },
  { customer: 2, monthsAgo: 0, market: 'wildberries', region: 'RU', url: 'https://www.wildberries.ru/catalog/000000016/detail.aspx', title: 'Qış gödəkçəsi, uşaq üçün', sizeColor: '128, göy', qty: 1, status: 'purchase_confirmed', quote: { currency: 'RUB', unit: 5600, domestic: 0, weight: 1.1, state: 'ACCEPTED' }, paid: true },
  { customer: 2, monthsAgo: 0, market: null, region: 'EU', url: 'https://example-design-store.eu/item/wall-clock', title: 'Divar saatı, skandinav dizayn', qty: 1, status: 'price_calculation' },
  { customer: 0, monthsAgo: 0, market: null, region: 'CN', url: null, title: 'Instagram-da gördüyüm dəri çanta (şəkil ilə sorğu)', qty: 1, status: 'request_received' },
];

async function seedDemoOrders(adminId: string, customerIds: string[]) {
  if ((await db.order.count()) > 0) return;
  const regionRows = Object.fromEntries((await db.region.findMany()).map((r) => [r.key, r]));
  const statusOrder = (await db.orderStatus.findMany({ orderBy: { sortOrder: 'asc' } })).map((s) => s.key);

  for (const [i, d] of demoOrders.entries()) {
    const createdAt = new Date();
    createdAt.setMonth(createdAt.getMonth() - d.monthsAgo);
    createdAt.setDate(Math.max(1, createdAt.getDate() - (i % 5) - (d.monthsAgo === 0 ? i % 3 : 3)));
    const at = (days: number) => new Date(Math.min(Date.now(), createdAt.getTime() + days * 86_400_000));

    const order = await db.order.create({
      data: {
        userId: customerIds[d.customer],
        regionKey: d.region,
        statusKey: d.status,
        createdAt,
        events: { create: { description: 'created', status: 'request_received', createdAt } },
        items: {
          create: {
            method: d.url ? 'URL' : 'IMAGE',
            sourceUrl: d.url,
            sourceMarketplace: d.market,
            title: d.url ? d.title : null,
            description: d.url ? null : d.title,
            sizeColor: d.sizeColor,
            quantity: d.qty,
            createdAt,
          },
        },
      },
      include: { items: true },
    });

    if (d.quote) {
      const region = regionRows[d.region];
      const rate = rates[d.quote.currency];
      const cargo = Math.round(Math.max(d.quote.weight, Number(region.minBillableWeightKg)) * Number(region.cargoPerKgUsd) * rates.USD * 100) / 100;
      const line = { unitPrice: d.quote.unit, quantity: d.qty, domesticShipping: d.quote.domestic, exchangeRate: rate };
      const input = {
        lines: [line],
        internationalShippingAzn: cargo,
        commissionPercent: Number(region.commissionPercent),
        commissionBasis: 'PRODUCT' as const,
        minCommissionAzn: Number(region.minCommissionAzn),
        sourcingFeeAzn: 0,
        customsChargesAzn: 0,
        otherExpensesAzn: 0,
      };
      const b = calculateOrderQuote(input);
      const quotation = await db.quotation.create({
        data: {
          orderId: order.id,
          version: 1,
          status: d.quote.state,
          weightKg: d.quote.weight,
          commissionPercent: input.commissionPercent,
          commissionBasis: 'PRODUCT',
          minCommissionAzn: input.minCommissionAzn,
          productCostAzn: b.productCostAzn,
          domesticShippingAzn: b.domesticShippingAzn,
          internationalShippingAzn: b.internationalShippingAzn,
          serviceFeeAzn: b.serviceFeeAzn,
          sourcingFeeAzn: 0,
          customsChargesAzn: 0,
          otherExpensesAzn: 0,
          totalAzn: b.totalAzn,
          createdAt: at(1),
          expiresAt: d.quote.state === 'SENT' ? new Date(Date.now() + 3 * 86_400_000) : at(4),
          decidedAt: d.quote.state === 'SENT' ? null : at(2),
          lines: {
            create: {
              itemId: order.items[0].id,
              currency: d.quote.currency,
              exchangeRate: rate,
              unitPrice: line.unitPrice,
              quantity: line.quantity,
              domesticShipping: line.domesticShipping,
              productCost: b.lines[0].productCost,
              productCostAzn: b.lines[0].productCostAzn,
              domesticShippingAzn: b.lines[0].domesticShippingAzn,
            },
          },
        },
      });
      await db.orderEvent.create({ data: { orderId: order.id, description: 'quote_sent', actorId: adminId, createdAt: at(1) } });
      if (d.quote.state === 'ACCEPTED') {
        await db.orderEvent.create({ data: { orderId: order.id, description: 'quote_accepted', createdAt: at(2) } });
      }
      if (d.quote.state === 'REJECTED') {
        await db.orderEvent.create({ data: { orderId: order.id, description: 'quote_rejected', createdAt: at(2) } });
      }
      if (d.paid) {
        await db.payment.create({
          data: {
            orderId: order.id,
            quotationId: quotation.id,
            amount: b.totalAzn,
            status: 'CONFIRMED',
            paymentMethod: i % 2 ? 'CARD_TO_CARD' : 'BANK_TRANSFER',
            createdAt: at(2),
            confirmedAt: at(3),
          },
        });
        await db.orderEvent.create({ data: { orderId: order.id, description: 'payment_confirmed', actorId: adminId, createdAt: at(3) } });
      }
    }

    // Status history up to the current status (demo timestamps).
    if (d.status !== 'cancelled') {
      const reached = statusOrder.slice(1, statusOrder.indexOf(d.status) + 1);
      for (const [step, key] of reached.entries()) {
        await db.orderEvent.create({
          data: { orderId: order.id, description: 'status_changed', status: key, actorId: adminId, createdAt: at(1 + step * 2) },
        });
      }
    } else {
      await db.orderEvent.create({ data: { orderId: order.id, description: 'status_changed', status: 'cancelled', actorId: adminId, createdAt: at(3) } });
    }

    if (d.tracking) {
      await db.tracking.create({
        data: { orderId: order.id, carrier: 'Demo Cargo', trackingNumber: `DEMO${String(100000 + i)}AZ`, status: d.status === 'completed' ? 'Delivered' : 'In transit' },
      });
    }
  }

  await db.order.create({
    data: {
      userId: customerIds[1],
      regionKey: 'CN',
      statusKey: 'price_calculation',
      instructions: 'Hamısını bir bağlamada göndərin.',
      events: {
        create: [
          { description: 'created', status: 'request_received' },
          { description: 'status_changed', status: 'price_calculation', actorId: adminId },
        ],
      },
      items: {
        create: [
          { position: 0, method: 'URL', sourceUrl: 'https://item.taobao.com/item.htm?id=000000000020', sourceMarketplace: 'taobao', title: 'Kətan yataq dəsti, 2 nəfərlik', sizeColor: 'bej', quantity: 1, clientPrice: 189, clientCurrency: 'CNY' },
          { position: 1, method: 'URL', sourceUrl: 'https://detail.1688.com/offer/000000000021.html', sourceMarketplace: '1688', title: 'Silikon mətbəx alətləri dəsti', quantity: 2, clientPrice: 35, clientCurrency: 'CNY' },
          { position: 2, method: 'URL', sourceUrl: 'https://www.temu.com/goods-detail-g-000000000022.html', sourceMarketplace: 'temu', title: 'LED gecə lampası', quantity: 1, clientPrice: 6.99, clientCurrency: 'USD' },
        ],
      },
    },
  });

  await db.internalNote.create({
    data: {
      orderId: (await db.order.findFirstOrThrow({ where: { statusKey: 'price_calculation' } })).id,
      authorId: adminId,
      body: 'Demo qeyd: satıcıdan çatdırılma qiymətini soruşmaq lazımdır.',
    },
  });
}

async function main() {
  await seedReference();
  const { admin, customers } = await seedUsers();
  await seedDemoOrders(admin.id, customers.map((c) => c.id));
  console.log('Seed complete. Demo logins are the SEED_* values in your .env file.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
