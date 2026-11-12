import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { Breakdown } from '@/components/breakdown';
import { Badge, ButtonLink, Card, Container, Eyebrow } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { getExampleQuote } from '@/lib/example-quote';
import { fmt, formatAzn, formatDate } from '@/lib/format';
import { getCatalog, getSettings } from '@/lib/settings';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.pricingPage.title };
}

export default async function PricingPage() {
  const { m, locale } = await getI18n();
  const p = m.pricingPage;
  const [example, { regions, rates }, { customs }] = await Promise.all([getExampleQuote(m, locale), getCatalog(), getSettings()]);
  const enabled = regions.filter((r) => r.enabled);
  const first = enabled[0];

  const formula = [
    { k: 'product', help: p.help.product },
    { k: 'domestic', help: p.help.domestic },
    { k: 'international', help: p.help.international },
    { k: 'service', help: first ? fmt(p.help.service, { pct: first.commissionPercent, min: formatAzn(first.minCommissionAzn, locale) }) : '' },
    { k: 'customs', help: p.help.customs },
  ] as const;

  return (
    <Container className="py-14 lg:py-20">
      <div className="max-w-2xl">
        <Eyebrow>{m.nav.pricing}</Eyebrow>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">{p.title}</h1>
        <p className="mt-5 text-lg leading-relaxed text-ink-soft">{p.intro}</p>
      </div>

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
            <p className="mt-5 text-[13px] leading-relaxed text-muted">{fmt(p.exampleNote, { region: example.region.name })}</p>
          </Card>
        )}
      </div>

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
                <tr key={r.key}>
                  <td className="px-5 py-4 font-medium">{r.name}</td>
                  <td className="px-5 py-4">{r.commissionPercent}%</td>
                  <td className="px-5 py-4">{formatAzn(r.minCommissionAzn, locale)}</td>
                  <td className="px-5 py-4">{r.cargoPerKgUsd.toFixed(2)} USD</td>
                  <td className="px-5 py-4">{r.minBillableWeightKg} kg</td>
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
