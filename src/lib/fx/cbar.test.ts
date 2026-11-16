import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cbarUrl, parseCbarXml } from './cbar.ts';

// Shape of the real bulletin (whitespace and names as published), trimmed to a few currencies.
const sample = `<?xml version="1.0" encoding="UTF-8"?>
<ValCurs Date="13.11.2026" Name="AZN məzənnələri">
  <ValType Type="Bank metalları">
    <Valute Code="XAU"><Nominal>1 t.u.</Nominal><Name>Qızıl</Name><Value>6651.5305</Value></Valute>
  </ValType>
  <ValType Type="Xarici valyutalar">
    <Valute Code="USD">

        <Nominal>1</Nominal>
        <Name>1 ABŞ dolları</Name>
      <Value>1.7</Value>
    </Valute>
    <Valute Code="CNY"><Nominal>1</Nominal><Name>1 Çin yuanı</Name><Value>0.2549</Value></Valute>
    <Valute Code="RUB"><Nominal>100</Nominal><Name>100 Rusiya rublu</Name><Value>2.0511</Value></Valute>
    <Valute Code="BAD"><Nominal>0</Nominal><Name>broken</Name><Value>1</Value></Valute>
  </ValType>
</ValCurs>`;

test('CBAR bulletin: rates per ONE unit, nominal 100 divided, bad rows skipped', () => {
  const { date, rates } = parseCbarXml(sample);
  assert.equal(date, '13.11.2026');
  assert.equal(rates.USD, 1.7);
  assert.equal(rates.CNY, 0.2549);
  assert.equal(rates.RUB, 0.020511);
  assert.equal(rates.XAU, 6651.5305); // "1 t.u." parses as 1 — metals are never applied, only configured currencies are
  assert.equal(rates.BAD, undefined);
});

test('CBAR url uses DD.MM.YYYY', () => {
  assert.equal(cbarUrl(new Date(Date.UTC(2026, 0, 5))), 'https://www.cbar.az/currencies/05.01.2026.xml');
});
