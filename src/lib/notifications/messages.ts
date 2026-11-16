// Pure message builder for customer notifications (email + WhatsApp). No imports with side effects,
// so it is unit-tested directly. Texts live here, not in the site dictionaries: they are sent, not rendered.

export type NotifyEvent = 'quote_ready' | 'payment_confirmed' | 'status_update' | 'quote_expiring' | 'payment_reminder' | 'item_unavailable';
export type NotifyLocale = 'az' | 'ru' | 'en';

/** Status changes the customer hears about. Everything else stays in the dashboard timeline. */
export const NOTIFY_STATUSES = ['in_transit', 'arrived_az', 'ready_for_pickup', 'cargo_delayed', 'customs_hold', 'lost'] as const;
/** Statuses that mean "something is holding the parcel": shown as a notice to the customer, not as a timeline step. */
export const DELAY_STATUSES = ['cargo_delayed', 'customs_hold', 'lost'] as const;
export const notifiesStatus = (key: string) => (NOTIFY_STATUSES as readonly string[]).includes(key);

export type MessageContext = {
  name: string;
  orderNo: string;
  url: string;
  /** quote_ready: quotation total; payment_confirmed: confirmed amount. Already formatted ("59,40 ₼"). */
  amount?: string;
  /** quote_ready: last day the quotation is valid, formatted. */
  validUntil?: string;
  /** item_unavailable: the item's name. */
  itemTitle?: string;
  /** status_update: the new status key and its label in the customer's language. */
  statusKey?: string;
  statusLabel?: string;
  brand: string;
  /** Support contacts printed under the message ("email · phone"). */
  contact?: string;
};

type Copy = { subject: string; heading: string; body: string; button: string };

const T: Record<NotifyLocale, {
  hello: string;
  footer: string;
  quote: Copy;
  payment: Copy;
  expiring: Copy;
  payReminder: Copy;
  unavailable: Copy;
  status: Record<string, Copy> & { other: Copy };
}> = {
  az: {
    hello: 'Salam, {name}!',
    footer: 'Bu məktubu {brand} sifarişiniz barədə göndəririk. Bildirişləri kabinetinizdə söndürə bilərsiniz.',
    quote: { subject: '{orderNo}: qiymət təklifi hazırdır', heading: 'Qiymət təklifi hazırdır', body: '{orderNo} sifarişiniz üçün yekun məbləğ: {amount}. Təklif {validUntil} tarixinədək qüvvədədir — baxın və təsdiqləyin.', button: 'Təklifə bax' },
    expiring: { subject: '{orderNo}: təklif sabah bitir', heading: 'Təklifin müddəti bitir', body: '{orderNo} sifarişi üçün {amount} məbləğində təklif {validUntil} tarixinədək qüvvədədir. Qiymət dəyişməsin deyə vaxtında təsdiqləyin.', button: 'Təklifə bax' },
    payReminder: { subject: '{orderNo}: ödənişi gözləyirik', heading: 'Ödənişi gözləyirik', body: '{orderNo} sifarişini təsdiqləmisiniz. Ödənilməli məbləğ: {amount}. Ödənişdən sonra məhsulu dərhal alırıq.', button: 'Ödəniş qaydası' },
    unavailable: { subject: '{orderNo}: bir məhsul stokda yoxdur', heading: 'Bir məhsul stokda yoxdur', body: '«{itemTitle}» satıcıda bitib və sifarişdən çıxarılıb. Qalan məhsullar üçün təklifi yeniləyəcəyik. Alternativ istəsəniz, bizə yazın.', button: 'Sifarişə bax' },
    payment: { subject: '{orderNo}: ödəniş təsdiqləndi', heading: 'Ödəniş təsdiqləndi', body: '{amount} məbləğində ödənişinizi aldıq. Məhsulu alırıq və hər mərhələ barədə xəbər verəcəyik.', button: 'Sifarişə bax' },
    status: {
      in_transit: { subject: '{orderNo}: bağlama yola düşdü', heading: 'Bağlamanız yoldadır', body: '{orderNo} sifarişiniz beynəlxalq karqo ilə Azərbaycana yola düşdü.', button: 'İzlə' },
      arrived_az: { subject: '{orderNo}: bağlama Bakıdadır', heading: 'Bağlamanız Bakıya çatdı', body: '{orderNo} sifarişiniz Azərbaycana çatdı. Gömrük rəsmiləşdirilməsindən sonra təhvilə hazır olacaq.', button: 'Sifarişə bax' },
      lost: { subject: '{orderNo}: bağlama itib — araşdırırıq', heading: 'Bağlama daşıyıcıda itib', body: '{orderNo} sifarişinizin bağlaması daşıyıcıda itib. Axtarış aparırıq və şərtlərə uyğun olaraq sizinlə əlaqə saxlayacağıq.', button: 'Sifarişə bax' },
      cargo_delayed: { subject: '{orderNo}: karqoda gecikmə', heading: 'Bağlama gecikir', body: '{orderNo} sifarişiniz karqo daşıyıcısında gecikir. Daşıyıcı ilə əlaqədəyik və yeni müddəti sizə bildirəcəyik.', button: 'Sifarişə bax' },
      customs_hold: { subject: '{orderNo}: gömrükdə gecikmə', heading: 'Bağlama gömrükdə saxlanılıb', body: '{orderNo} sifarişiniz gömrük yoxlamasındadır. Lazım olarsa, sənədlər və ya rüsumlar barədə sizinlə əlaqə saxlayacağıq.', button: 'Sifarişə bax' },
      ready_for_pickup: { subject: '{orderNo}: təhvilə hazırdır', heading: 'Bağlamanız təhvilə hazırdır', body: '{orderNo} sifarişinizi götürə və ya çatdırılma sifariş edə bilərsiniz.', button: 'Ətraflı' },
      other: { subject: '{orderNo}: {statusLabel}', heading: '{statusLabel}', body: '{orderNo} sifarişinizin statusu yeniləndi: {statusLabel}.', button: 'Sifarişə bax' },
    },
  },
  ru: {
    hello: 'Здравствуйте, {name}!',
    footer: 'Это письмо о вашем заказе в {brand}. Уведомления можно отключить в личном кабинете.',
    quote: { subject: '{orderNo}: расчёт готов', heading: 'Расчёт готов', body: 'Итоговая сумма по заказу {orderNo}: {amount}. Расчёт действует до {validUntil} — посмотрите и подтвердите.', button: 'Посмотреть расчёт' },
    expiring: { subject: '{orderNo}: расчёт истекает завтра', heading: 'Расчёт скоро истечёт', body: 'Расчёт по заказу {orderNo} на {amount} действует до {validUntil}. Подтвердите его вовремя, чтобы цена не изменилась.', button: 'Посмотреть расчёт' },
    payReminder: { subject: '{orderNo}: ждём оплату', heading: 'Ждём оплату', body: 'Вы подтвердили заказ {orderNo}. К оплате: {amount}. Сразу после оплаты выкупаем товар.', button: 'Как оплатить' },
    unavailable: { subject: '{orderNo}: одного товара нет в наличии', heading: 'Одного товара нет в наличии', body: '«{itemTitle}» закончился у продавца и убран из заказа. Обновим расчёт по остальным товарам. Если нужна замена — напишите нам.', button: 'Открыть заказ' },
    payment: { subject: '{orderNo}: оплата подтверждена', heading: 'Оплата подтверждена', body: 'Мы получили вашу оплату {amount}. Выкупаем товар и сообщим о каждом этапе.', button: 'Открыть заказ' },
    status: {
      in_transit: { subject: '{orderNo}: посылка в пути', heading: 'Посылка в пути', body: 'Заказ {orderNo} отправлен международным карго в Азербайджан.', button: 'Отследить' },
      arrived_az: { subject: '{orderNo}: посылка в Баку', heading: 'Посылка прибыла в Баку', body: 'Заказ {orderNo} прибыл в Азербайджан. После таможенного оформления он будет готов к выдаче.', button: 'Открыть заказ' },
      lost: { subject: '{orderNo}: посылка утеряна — разбираемся', heading: 'Посылка утеряна перевозчиком', body: 'Посылку заказа {orderNo} потерял перевозчик. Мы ведём поиск и свяжемся с вами согласно условиям сервиса.', button: 'Открыть заказ' },
      cargo_delayed: { subject: '{orderNo}: задержка у карго', heading: 'Посылка задерживается', body: 'Заказ {orderNo} задерживается у перевозчика. Мы на связи с карго и сообщим новый срок.', button: 'Открыть заказ' },
      customs_hold: { subject: '{orderNo}: задержка на таможне', heading: 'Посылка на таможенной проверке', body: 'Заказ {orderNo} проходит таможенную проверку. Если понадобятся документы или пошлина, мы свяжемся с вами.', button: 'Открыть заказ' },
      ready_for_pickup: { subject: '{orderNo}: готов к выдаче', heading: 'Посылка готова к выдаче', body: 'Заказ {orderNo} можно забрать или заказать доставку.', button: 'Подробнее' },
      other: { subject: '{orderNo}: {statusLabel}', heading: '{statusLabel}', body: 'Статус заказа {orderNo} обновлён: {statusLabel}.', button: 'Открыть заказ' },
    },
  },
  en: {
    hello: 'Hello, {name}!',
    footer: 'You receive this email about your {brand} order. You can turn notifications off in your dashboard.',
    quote: { subject: '{orderNo}: your quotation is ready', heading: 'Your quotation is ready', body: 'The total for order {orderNo} is {amount}. The quotation is valid until {validUntil} — review and accept it.', button: 'View quotation' },
    expiring: { subject: '{orderNo}: quotation expires tomorrow', heading: 'Your quotation is about to expire', body: 'The {amount} quotation for order {orderNo} is valid until {validUntil}. Accept it in time to keep the price.', button: 'View quotation' },
    payReminder: { subject: '{orderNo}: waiting for your payment', heading: 'Waiting for your payment', body: 'You accepted order {orderNo}. Amount due: {amount}. We buy your item as soon as the payment arrives.', button: 'How to pay' },
    unavailable: { subject: '{orderNo}: one item is out of stock', heading: 'One item is out of stock', body: '“{itemTitle}” sold out at the seller and was removed from your order. We will update the quotation for the remaining items. Write to us if you want an alternative.', button: 'View order' },
    payment: { subject: '{orderNo}: payment confirmed', heading: 'Payment confirmed', body: 'We received your payment of {amount}. We are purchasing your item and will update you at every step.', button: 'View order' },
    status: {
      in_transit: { subject: '{orderNo}: your parcel is on its way', heading: 'Your parcel is on its way', body: 'Order {orderNo} has left by international cargo for Azerbaijan.', button: 'Track it' },
      arrived_az: { subject: '{orderNo}: your parcel is in Baku', heading: 'Your parcel has arrived in Baku', body: 'Order {orderNo} has arrived in Azerbaijan. It will be ready for pickup after customs clearance.', button: 'View order' },
      lost: { subject: '{orderNo}: parcel lost — we are on it', heading: 'The carrier lost your parcel', body: 'The parcel of order {orderNo} was lost by the carrier. We are investigating and will contact you according to our terms.', button: 'View order' },
      cargo_delayed: { subject: '{orderNo}: delayed by the carrier', heading: 'Your parcel is delayed', body: 'Order {orderNo} is delayed by the carrier. We are in touch with them and will tell you the new date.', button: 'View order' },
      customs_hold: { subject: '{orderNo}: held at customs', heading: 'Your parcel is at customs inspection', body: 'Order {orderNo} is going through a customs check. If documents or duties are needed, we will contact you.', button: 'View order' },
      ready_for_pickup: { subject: '{orderNo}: ready for pickup', heading: 'Your parcel is ready', body: 'Order {orderNo} is ready for pickup or delivery.', button: 'Details' },
      other: { subject: '{orderNo}: {statusLabel}', heading: '{statusLabel}', body: 'Order {orderNo} status changed: {statusLabel}.', button: 'View order' },
    },
  },
};

const fill = (template: string, ctx: MessageContext) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String((ctx as Record<string, unknown>)[key] ?? ''));

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const asLocale = (value: string | null | undefined): NotifyLocale => (value === 'ru' || value === 'en' ? value : 'az');

function pick(event: NotifyEvent, locale: NotifyLocale, statusKey?: string): Copy {
  const t = T[locale];
  if (event === 'quote_ready') return t.quote;
  if (event === 'payment_confirmed') return t.payment;
  if (event === 'quote_expiring') return t.expiring;
  if (event === 'payment_reminder') return t.payReminder;
  if (event === 'item_unavailable') return t.unavailable;
  return (statusKey && t.status[statusKey]) || t.status.other;
}

/**
 * WhatsApp business-initiated messages must use templates approved in WhatsApp Manager.
 * Each template has three body parameters: {{1}} name, {{2}} order number, {{3}} amount / status.
 */
export const WHATSAPP_TEMPLATES: Record<NotifyEvent, string> = {
  quote_ready: 'tapdin_quote_ready',
  payment_confirmed: 'tapdin_payment_confirmed',
  status_update: 'tapdin_order_status',
  quote_expiring: 'tapdin_quote_expiring',
  payment_reminder: 'tapdin_payment_reminder',
  item_unavailable: 'tapdin_item_unavailable',
};

export function buildMessage(event: NotifyEvent, locale: NotifyLocale, ctx: MessageContext) {
  const copy = pick(event, locale, ctx.statusKey);
  const t = T[locale];
  const subject = fill(copy.subject, ctx);
  const heading = fill(copy.heading, ctx);
  const body = fill(copy.body, ctx);
  const hello = fill(t.hello, ctx);
  const footer = fill(t.footer, ctx);
  const button = fill(copy.button, ctx);

  const text = `${hello}\n\n${body}\n\n${button}: ${ctx.url}\n\n— ${ctx.brand}${ctx.contact ? `\n${ctx.contact}` : ''}\n${footer}`;

  const e = (s: string) => escapeHtml(s);
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f2ec;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#121311">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ec;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="background:#060606;padding:22px 28px"><span style="font-size:22px;font-weight:700;letter-spacing:-0.5px;color:#f4f2ec">${e(ctx.brand)}<span style="color:#ff5a1f">.</span></span></td></tr>
<tr><td style="padding:32px 28px 8px">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#ff5a1f;font-weight:600">${e(ctx.orderNo)}</p>
<h1 style="margin:0 0 18px;font-size:26px;line-height:1.15;letter-spacing:-0.5px">${e(heading)}</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${e(hello)}</p>
<p style="margin:0 0 26px;font-size:15px;line-height:1.6;color:#2e302b">${e(body)}</p>
<a href="${e(ctx.url)}" style="display:inline-block;background:#ff5a1f;color:#0a0a09;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:999px">${e(button)} →</a>
</td></tr>
<tr><td style="padding:28px;font-size:12px;line-height:1.6;color:#8b8a84">${ctx.contact ? `<span style="color:#2e302b;font-weight:600">${e(ctx.contact)}</span><br>` : ''}${e(footer)}</td></tr>
</table></td></tr></table></body></html>`;

  const third = event === 'status_update' ? ctx.statusLabel ?? '' : event === 'item_unavailable' ? ctx.itemTitle ?? '' : ctx.amount ?? '';
  const whatsapp = { template: WHATSAPP_TEMPLATES[event], language: locale, params: [ctx.name, ctx.orderNo, third] };

  return { subject, text, html, whatsapp };
}

/** WhatsApp wants digits only, with the country code. Azerbaijani local numbers (0XX…) get 994. */
export function whatsappNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.length === 10 && digits.startsWith('0')) digits = `994${digits.slice(1)}`;
  else if (digits.length === 9) digits = `994${digits}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

// ── Password reset ───────────────────────────────────────────────
const RESET: Record<NotifyLocale, { subject: string; heading: string; body: string; button: string; footer: string }> = {
  az: {
    subject: '{brand}: şifrənin bərpası',
    heading: 'Şifrənin bərpası',
    body: 'Hesabınız üçün şifrə bərpası istənildi. Yeni şifrə təyin etmək üçün düyməyə basın. Keçid 1 saat qüvvədədir və bir dəfə istifadə olunur.',
    button: 'Yeni şifrə təyin et',
    footer: 'Bunu siz istəməmisinizsə, bu məktuba məhəl qoymayın — şifrəniz dəyişməyəcək.',
  },
  ru: {
    subject: '{brand}: восстановление пароля',
    heading: 'Восстановление пароля',
    body: 'Для вашего аккаунта запрошено восстановление пароля. Нажмите кнопку, чтобы задать новый пароль. Ссылка действует 1 час и работает один раз.',
    button: 'Задать новый пароль',
    footer: 'Если это были не вы, просто проигнорируйте письмо — пароль не изменится.',
  },
  en: {
    subject: '{brand}: reset your password',
    heading: 'Reset your password',
    body: 'A password reset was requested for your account. Press the button to set a new password. The link is valid for 1 hour and works once.',
    button: 'Set a new password',
    footer: 'If this was not you, ignore this email — your password stays the same.',
  },
};

export function buildResetMessage(locale: NotifyLocale, ctx: { name: string; url: string; brand: string; contact?: string }) {
  const t = RESET[locale];
  const c = { ...ctx, orderNo: '' } as MessageContext;
  const subject = fill(t.subject, c);
  const hello = fill(T[locale].hello, c);
  const text = `${hello}\n\n${t.body}\n\n${t.button}: ${ctx.url}\n\n${t.footer}\n— ${ctx.brand}`;
  const e = (s: string) => escapeHtml(s);
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f2ec;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#121311">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ec;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="background:#060606;padding:22px 28px"><span style="font-size:22px;font-weight:700;letter-spacing:-0.5px;color:#f4f2ec">${e(ctx.brand)}<span style="color:#ff5a1f">.</span></span></td></tr>
<tr><td style="padding:32px 28px 8px">
<h1 style="margin:0 0 18px;font-size:26px;line-height:1.15;letter-spacing:-0.5px">${e(t.heading)}</h1>
<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${e(hello)}</p>
<p style="margin:0 0 26px;font-size:15px;line-height:1.6;color:#2e302b">${e(t.body)}</p>
<a href="${e(ctx.url)}" style="display:inline-block;background:#ff5a1f;color:#0a0a09;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:999px">${e(t.button)} →</a>
</td></tr>
<tr><td style="padding:28px;font-size:12px;line-height:1.6;color:#8b8a84">${ctx.contact ? `<span style="color:#2e302b;font-weight:600">${e(ctx.contact)}</span><br>` : ''}${e(t.footer)}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
