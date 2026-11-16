import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asLocale, buildMessage, escapeHtml, notifiesStatus, whatsappNumber, WHATSAPP_TEMPLATES } from './messages.ts';

const ctx = { name: 'Leyla', orderNo: 'TD-00011', url: 'https://tapdin.az/dashboard/orders/abc', brand: 'tapdın', amount: '59,40 ₼', validUntil: '15 noy 2026' };

test('quote ready: subject, amount, validity and link in every language', () => {
  for (const locale of ['az', 'ru', 'en'] as const) {
    const msg = buildMessage('quote_ready', locale, ctx);
    assert.ok(msg.subject.includes('TD-00011'), locale);
    assert.ok(msg.text.includes('59,40 ₼') && msg.text.includes('15 noy 2026') && msg.text.includes(ctx.url), locale);
    assert.ok(msg.html.includes(`href="${ctx.url}"`), locale);
    assert.deepEqual(msg.whatsapp, { template: WHATSAPP_TEMPLATES.quote_ready, language: locale, params: ['Leyla', 'TD-00011', '59,40 ₼'] });
  }
  assert.equal(buildMessage('quote_ready', 'ru', ctx).subject, 'TD-00011: расчёт готов');
});

test('payment confirmed and the three shipping statuses have their own copy', () => {
  assert.equal(buildMessage('payment_confirmed', 'en', ctx).subject, 'TD-00011: payment confirmed');
  assert.equal(buildMessage('status_update', 'ru', { ...ctx, statusKey: 'arrived_az', statusLabel: 'Прибыл в Азербайджан' }).subject, 'TD-00011: посылка в Баку');
  assert.equal(buildMessage('status_update', 'az', { ...ctx, statusKey: 'ready_for_pickup' }).subject, 'TD-00011: təhvilə hazırdır');
  const other = buildMessage('status_update', 'en', { ...ctx, statusKey: 'customs', statusLabel: 'Customs processing' });
  assert.equal(other.subject, 'TD-00011: Customs processing');
  assert.deepEqual(other.whatsapp.params, ['Leyla', 'TD-00011', 'Customs processing']);
});

test('only selected statuses notify the customer', () => {
  for (const key of ['in_transit', 'arrived_az', 'ready_for_pickup']) assert.equal(notifiesStatus(key), true, key);
  for (const key of ['request_received', 'price_calculation', 'quality_inspection', 'customs', 'completed']) assert.equal(notifiesStatus(key), false, key);
});

test('customer names cannot inject HTML into the email', () => {
  const msg = buildMessage('payment_confirmed', 'en', { ...ctx, name: '<img src=x onerror=alert(1)>' });
  assert.ok(!msg.html.includes('<img src=x'));
  assert.ok(msg.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.equal(escapeHtml(`"a"&'b'`), '&quot;a&quot;&amp;&#39;b&#39;');
});

test('phone numbers become WhatsApp ids; unusable ones are rejected', () => {
  assert.equal(whatsappNumber('+994 50 000 00 01'), '994500000001');
  assert.equal(whatsappNumber('00994500000001'), '994500000001');
  assert.equal(whatsappNumber('050 000 00 01'), '994500000001');
  assert.equal(whatsappNumber('50 000 00 01'), '994500000001');
  assert.equal(whatsappNumber('+7 916 123-45-67'), '79161234567');
  assert.equal(whatsappNumber('12345'), null);
  assert.equal(whatsappNumber(null), null);
});

test('unknown locales fall back to Azerbaijani', () => {
  assert.equal(asLocale('de'), 'az');
  assert.equal(asLocale(null), 'az');
  assert.equal(asLocale('ru'), 'ru');
});

test('support contacts appear under the message when given', () => {
  const msg = buildMessage('quote_ready', 'az', { ...ctx, contact: 'tapdin@protonmail.com · +994 99 221 14 88' });
  assert.ok(msg.text.includes('tapdin@protonmail.com · +994 99 221 14 88'));
  assert.ok(msg.html.includes('tapdin@protonmail.com · +994 99 221 14 88'));
});

test('reminders, out-of-stock and delays have their own messages', () => {
  assert.equal(buildMessage('quote_expiring', 'ru', ctx).subject, 'TD-00011: расчёт истекает завтра');
  assert.equal(buildMessage('payment_reminder', 'en', ctx).subject, 'TD-00011: waiting for your payment');
  const gone = buildMessage('item_unavailable', 'az', { ...ctx, itemTitle: 'LED lampa' });
  assert.ok(gone.text.includes('LED lampa'));
  assert.deepEqual(gone.whatsapp.params, ['Leyla', 'TD-00011', 'LED lampa']);
  assert.equal(buildMessage('status_update', 'ru', { ...ctx, statusKey: 'customs_hold' }).subject, 'TD-00011: задержка на таможне');
  assert.equal(notifiesStatus('cargo_delayed'), true);
});

test('lost parcel has its own message and counts as a problem status', () => {
  assert.equal(buildMessage('status_update', 'ru', { ...ctx, statusKey: 'lost' }).subject, 'TD-00011: посылка утеряна — разбираемся');
  assert.equal(notifiesStatus('lost'), true);
});
