import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';
import { Breakdown } from '@/components/breakdown';
import { CombineSavings } from '@/components/combine-savings';
import { Badge, ButtonLink, Card, Container, Eyebrow } from '@/components/ui';
import { regionLabel } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { getExampleQuote } from '@/lib/example-quote';
import { cn, fmt, formatAzn, formatDate } from '@/lib/format';
import { isComingSoon, isOrderable, isPublic } from '@/lib/regions';
import { getCatalog, getSettings } from '@/lib/settings';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.pricingPage.title };
}

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ region?: string }> }) {
  const [{ m, locale }, params] = await Promise.all([getI18n(), searchParams]);
  const p = m.pricingPage;
  const [catalog, { customs }] = await Promise.all([getCatalog(), getSettings()]);
  const { regions, rates, marketplaces } = catalog;
  const enabled = regions.filter(isPublic);
  // The whole page explains one region at a time: commission, cargo and currency differ between them.
  // Coming-soon regions can be selected, but show no rates or example — there are no prices for them yet.
  const first = enabled.find((r) => r.key === params.region) ?? enabled.find(isOrderable) ?? enabled[0];
  const firstSoon = isComingSoon(first);
  const pricedFor = firstSoon ? enabled.find(isOrderable) : first;
  const example = firstSoon ? null : await getExampleQuote(m, locale, first?.key);
  const otherStores: Record<string, string> = m.home.routes.otherStores;
  const usdRate = rates.find((r) => r.currency === 'USD')?.rateToAzn;
  const cargoText = (usd: number) => `${usd.toFixed(2)} USD${usdRate ? ` ≈ ${formatAzn(usd * usdRate, locale)}` : ''}`;
  const stores = first ? marketplaces.filter((x) => x.enabled && x.regionKey === first.key).map((x) => x.name) : [];

  const formula = [
    { k: 'product', help: p.help.product },
    { k: 'domestic', help: p.help.domestic },
    { k: 'international', help: p.help.international },
    { k: 'service', help: pricedFor ? fmt(p.help.service, { pct: pricedFor.commissionPercent, min: formatAzn(pricedFor.minCommissionAzn, locale) }) : '' },
    { k: 'customs', help: p.help.customs },
  ] as const;

  return (
    <Container className="py-14 lg:py-20">
      <div className="max-w-2xl">
        <Eyebrow>{m.nav.pricing}</Eyebrow>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">{p.title}</h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-soft">{p.intro}</p>
      </div>

      {first && (
        <section className="mt-12">
          <h2 className="text-xl font-semibold">{p.regionTitle}</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">{p.regionIntro}</p>
          <nav aria-label={p.regionTitle} className="mt-5 flex flex-wrap gap-2">
            {enabled.map((r) => (
              <Link
                key={r.key}
                href={`/pricing?region=${r.key}`}
                scroll={false}
                aria-current={r.key === first.key ? 'true' : undefined}
                className={cn(
                  'inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
                  r.key === first.key ? 'border-ink bg-ink text-paper' : isComingSoon(r) ? 'border-dashed border-line-strong text-muted hover:border-ink/40' : 'border-line-strong bg-surface hover:border-ink',
                )}
              >
                {regionLabel(m, r)}
                {isComingSoon(r) && <span className="text-[9px] font-semibold tracking-[0.18em] text-accent uppercase">{m.soon.badge}</span>}
              </Link>
            ))}
          </nav>
          {firstSoon ? (
            <div className="mt-5 flex flex-col gap-4 rounded-card border border-dashed border-line-strong p-6 sm:flex-row sm:items-center sm:gap-6">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-accent/40 text-accent">
                <Clock className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-accent uppercase">{m.soon.badge}</p>
                <p className="mt-1 font-display text-xl font-semibold tracking-tight">{fmt(m.soon.title, { region: regionLabel(m, first) })}</p>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-soft">{fmt(m.soon.text, { region: regionLabel(m, first) })}</p>
                {otherStores[first.key] && <p className="mt-2 text-[13px] text-muted">{otherStores[first.key]}</p>}
              </div>
            </div>
          ) : (
          <Card className="mt-5 grid gap-6 p-6 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.8fr_1fr]">
            <div>
              <p className="text-[12px] font-medium tracking-wide text-muted uppercase">{p.regionStores}</p>
              {stores.length > 0 && <p className="mt-2 font-display text-lg font-semibold tracking-tight">{stores.join(' · ')}</p>}
              {otherStores[first.key] && <p className="mt-1 text-sm leading-relaxed text-ink-soft">{otherStores[first.key]}</p>}
            </div>
            <dl className="tabular space-y-2 text-sm">
              {[
                [p.regionCurrency, first.defaultCurrency],
                [p.commission, `${first.commissionPercent}%`],
                [p.minCommission, formatAzn(first.minCommissionAzn, locale)],
                [p.cargoPerKg, cargoText(first.cargoPerKgUsd)],
                [p.minWeight, `${first.minBillableWeightKg} kg`],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-4">
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            {first.customsNote && (
              <div>
                <p className="text-[12px] font-medium tracking-wide text-muted uppercase">{p.regionCustoms}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{first.customsNote}</p>
              </div>
            )}
          </Card>
          )}
        </section>
      )}

      <div className="mt-14 grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
        <section>
          <h2 className="text-xl font-semibold">{p.formulaTitle}</h2>
          <ol className="mt-6 divide-y divide-line border-y border-line">
            {formula.map((f, i) => (
              <li key={f.k} className="grid grid-cols-[2rem_1fr] gap-x-3 py-5">
                <span className="tabular pt-0.5 text-sm text-muted">{i === 0 ? '' : '+'}</span>
                <div>
                  <p className="font-medium">{p.lines[f.k]}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{f.help}</p>
                </div>
              </li>
            ))}
            <li className="grid grid-cols-[2rem_1fr] gap-x-3 py-5">
              <span className="pt-0.5 text-sm font-medium">=</span>
              <p className="font-display text-lg font-semibold">{p.lines.total}</p>
            </li>
          </ol>
        </section>

        {example && (
          <Card className="p-6 sm:p-7">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">{p.exampleTitle}</h2>
              <Badge>{m.common.example}</Badge>
            </div>
            <Breakdown lines={example.lines} total={example.total} />
            <p className="mt-5 text-[13px] leading-relaxed text-muted">{fmt(p.exampleNote, { region: regionLabel(m, example.region) })}</p>
          </Card>
        )}
      </div>

      <CombineSavings catalog={catalog} m={m} locale={locale} compact />

      <section className="mt-20">
        <h2 className="text-2xl font-semibold">{p.termsTitle}</h2>
        <div className="mt-6 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {(['estimate', 'quote', 'paid', 'extra'] as const).map((k) => (
            <div key={k} className="bg-surface p-6">
              <p className="font-medium">{p.terms[k].t}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.terms[k].d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-20">
        <h2 className="text-2xl font-semibold">{p.paramsTitle}</h2>
        <p className="mt-2 text-sm text-muted">{p.paramsIntro}</p>
        <Card className="mt-6 overflow-x-auto">
          <table className="tabular w-full min-w-[560px] text-left text-sm">
            <thead className="text-[12px] tracking-wide text-muted uppercase">
              <tr className="border-b border-line">
                {[p.region, p.commission, p.minCommission, p.cargoPerKg, p.minWeight].map((h) => (
                  <th key={h} className="px-5 py-3.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {enabled.map((r) => (
                <tr key={r.key} className={r.key === first?.key ? 'bg-accent-soft/50' : undefined}>
                  <td className="px-5 py-4 font-medium">{regionLabel(m, r)}</td>
                  {isComingSoon(r) ? (
                    <td colSpan={4} className="px-5 py-4 text-muted">
                      <span className="mr-3 text-[11px] font-semibold tracking-[0.18em] text-accent uppercase">{m.soon.badge}</span>
                      {m.soon.short}
                    </td>
                  ) : (
                    <>
                      <td className="px-5 py-4">{r.commissionPercent}%</td>
                      <td className="px-5 py-4">{formatAzn(r.minCommissionAzn, locale)}</td>
                      <td className="px-5 py-4">{cargoText(r.cargoPerKgUsd)}</td>
                      <td className="px-5 py-4">{r.minBillableWeightKg} kg</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h3 className="font-semibold">{p.ratesTitle}</h3>
            <dl className="tabular mt-4 divide-y divide-line text-sm">
              {rates.map((r) => (
                <div key={r.currency} className="flex items-baseline justify-between py-2.5">
                  <dt>1 {r.currency}</dt>
                  <dd className="text-right">
                    <span className="font-medium">{r.rateToAzn.toFixed(4)} AZN</span>
                    <span className="ml-3 text-[12px] text-muted">{formatDate(r.updatedAt, locale)}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card className="p-6">
            <h3 className="font-semibold">{p.customsTitle}</h3>
            <p className="mt-4 text-sm leading-relaxed whitespace-pre-line text-ink-soft">{customs.note}</p>
          </Card>
        </div>
        <p className="mt-6 max-w-3xl text-[13px] leading-relaxed text-muted">{p.disclaimer}</p>
      </section>

      <ButtonLink href="/order" size="lg" className="mt-12">
        {p.cta}
        <ArrowRight className="size-4" aria-hidden />
      </ButtonLink>
    </Container>
  );
}
