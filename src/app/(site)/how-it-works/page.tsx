import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { ButtonLink, Container, Eyebrow } from '@/components/ui';
import { regionLabel } from '@/i18n/config';
import { CombineSavings } from '@/components/combine-savings';
import { getI18n } from '@/i18n/server';
import { fmt } from '@/lib/format';
import { isComingSoon, isPublic } from '@/lib/regions';
import { getCatalog } from '@/lib/settings';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.nav.how };
}

export default async function HowItWorksPage() {
  const [{ m, locale }, catalog] = await Promise.all([getI18n(), getCatalog()]);
  const otherStores: Record<string, string> = m.home.routes.otherStores;
  const regions = catalog.regions.filter(isPublic);

  return (
    <Container className="max-w-4xl py-14 lg:py-20">
      <Eyebrow>{m.nav.how}</Eyebrow>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">{m.home.how.subtitle}</h1>

      <section className="mt-10">
        <h2 className="text-[13px] font-medium tracking-wide text-muted uppercase">{m.pricingPage.howStores}</h2>
        <ul className="mt-4 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
          {regions.map((r) => {
            const soon = isComingSoon(r);
            const stores = soon ? [] : catalog.marketplaces.filter((x) => x.enabled && x.regionKey === r.key).map((x) => x.name);
            return (
              <li key={r.key} className={soon ? 'bg-surface/60 p-5' : 'bg-surface p-5'} title={soon ? fmt(m.soon.text, { region: regionLabel(m, r) }) : undefined}>
                <p className={soon ? 'flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight text-muted' : 'font-display text-lg font-semibold tracking-tight'}>
                  {regionLabel(m, r)}
                  {soon && <span className="rounded-full border border-dashed border-accent/60 px-2 py-0.5 text-[10px] tracking-[0.18em] text-accent uppercase">{m.soon.badge}</span>}
                </p>
                <p className={soon ? 'mt-1 text-sm leading-relaxed text-muted' : 'mt-1 text-sm leading-relaxed text-ink-soft'}>{soon ? m.soon.short : [...stores, otherStores[r.key]].filter(Boolean).join(' · ')}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <ol className="mt-14">
        {m.steps.map((s, i) => (
          <li key={s.title} className="relative grid grid-cols-[3rem_1fr] gap-x-4 pb-12 last:pb-0 sm:grid-cols-[4.5rem_1fr]">
            {i < m.steps.length - 1 && <span className="absolute top-12 bottom-0 left-6 w-px bg-line-strong sm:left-7" aria-hidden />}
            <span className="tabular flex size-12 items-center justify-center rounded-full border border-line-strong bg-surface font-display font-medium sm:size-14">
              {i + 1}
            </span>
            <div className="pt-2.5 sm:pt-3.5">
              <h2 className="text-xl font-semibold sm:text-2xl">{s.title}</h2>
              <p className="mt-2 max-w-xl leading-relaxed text-ink-soft">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <CombineSavings catalog={catalog} m={m} locale={locale} compact />

      <div className="mt-16 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-3">
        {m.home.benefits.items.slice(0, 3).map((b) => (
          <div key={b.title} className="bg-surface p-6">
            <p className="font-medium">{b.title}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">{b.text}</p>
          </div>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap gap-3">
        <ButtonLink href="/order" size="lg">
          {m.nav.order}
          <ArrowRight className="size-4" aria-hidden />
        </ButtonLink>
        <ButtonLink href="/pricing" variant="secondary" size="lg">
          {m.nav.pricing}
        </ButtonLink>
      </div>
    </Container>
  );
}
