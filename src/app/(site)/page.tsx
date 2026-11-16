import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Clock, Plus } from 'lucide-react';
import { Breakdown } from '@/components/breakdown';
import { CombineSavings } from '@/components/combine-savings';
import { WorldMap } from '@/components/globe/world-map';
import { Hero } from '@/components/hero/hero';
import { ProcessRail } from '@/components/home/process-rail';
import { RequestConsole } from '@/components/home/request-console';
import { Reveal } from '@/components/reveal';
import { Badge, ButtonLink, Container } from '@/components/ui';
import { brand } from '@/config/brand';
import { regionLabel } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { getExampleQuote } from '@/lib/example-quote';
import { fmt } from '@/lib/format';
import { isComingSoon, isPublic } from '@/lib/regions';
import { getCatalog } from '@/lib/settings';

export default async function HomePage() {
  const { m, locale } = await getI18n();
  const [example, catalog] = await Promise.all([getExampleQuote(m, locale), getCatalog()]);
  const h = m.home;
  const otherStores: Record<string, string> = h.routes.otherStores;
  // Only regions enabled in admin are presented. COMING_SOON ones stay visible, marked and closed for orders.
  const regions = catalog.regions
    .filter(isPublic)
    .map((r) => ({
      key: r.key,
      name: regionLabel(m, r),
      soon: isComingSoon(r),
      currency: r.defaultCurrency,
      commissionPercent: r.commissionPercent,
      cargoPerKgUsd: r.cargoPerKgUsd,
      stores: catalog.marketplaces.filter((x) => x.enabled && x.regionKey === r.key).map((x) => x.name),
      otherStores: otherStores[r.key] ?? '',
    }));
  const generic: Record<string, string> = { US: h.hero.usStores, EU: h.hero.euStores };
  // Every store row links into the real order form with its region preselected.
  // Announced regions show one generic row ("US stores"), not the store list used for link detection.
  const gallery = regions.flatMap((r) => [
    ...(r.soon ? [] : r.stores.map((name) => ({ name, region: r.name, key: r.key, latin: true, soon: false }))),
    ...(generic[r.key] ? [{ name: generic[r.key], region: r.name, key: r.key, latin: false, soon: r.soon }] : []),
  ]);
  const soonText = { badge: m.soon.badge, title: m.soon.title, text: m.soon.text };
  const proof = [h.benefits.items[2], h.benefits.items[3], h.benefits.items[5]];

  return (
    <>
      {/* ── A · Hero: the world connects to Baku ── */}
      <Hero
        text={h.hero}
        regions={regions.map((r) => ({ key: r.key, name: r.name, stores: r.soon ? [] : r.stores, other: r.otherStores, soon: r.soon }))}
        storeNames={gallery.map((g) => ({ name: g.name, latin: g.latin }))}
        baku={h.routes.baku}
        brand={brand.name}
        statement={h.hero.title}
        orderLabel={h.routes.order}
        soon={soonText}
      />

      {/* ── B · Marketplaces: an index you can read from across the room ── */}
      <section className="relative overflow-hidden">
        <div className="border-y border-line py-5" aria-hidden>
          <div className="marquee flex w-max gap-12 pr-12 text-[12px] font-medium tracking-[0.24em] whitespace-nowrap text-muted uppercase">
            {[...gallery, ...gallery, ...gallery, ...gallery].map((g, i) => (
              <span key={i} lang={g.latin ? 'en' : undefined} className={g.soon ? 'flex items-center gap-12 text-muted/50' : 'flex items-center gap-12'}>
                {g.name}
                {g.soon && <span className="-ml-9 text-accent/70">· {m.soon.badge}</span>}
                <span className="size-1 rounded-full bg-accent" />
              </span>
            ))}
          </div>
        </div>
        <Container className="py-20 lg:py-32">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
            <h2 className="display text-[clamp(2.2rem,5.4vw,4.75rem)]">{h.markets.title}</h2>
            <p className="max-w-md text-lg leading-relaxed text-ink-soft lg:justify-self-end">{h.markets.subtitle}</p>
          </div>
          <ul className="mt-14 border-t border-line">
            {gallery.map((g, i) =>
              g.soon ? (
                <li key={`${g.key}-${g.name}`}>
                  <div
                    className="group relative flex items-baseline justify-between gap-6 border-b border-line py-5 sm:py-7"
                    title={fmt(m.soon.text, { region: g.region })}
                  >
                    <span className="relative flex items-baseline gap-5 sm:gap-8">
                      <span className="tabular hidden text-[12px] tracking-[0.2em] text-muted/60 sm:block">{String(i + 1).padStart(2, '0')}</span>
                      <span className="display text-[clamp(2rem,7.2vw,6.25rem)] text-transparent [-webkit-text-stroke:1px_var(--color-line-strong)] transition-colors duration-500 group-hover:[-webkit-text-stroke-color:var(--color-muted)]">
                        {g.name}
                      </span>
                    </span>
                    <span className="relative flex shrink-0 flex-col items-end gap-2 text-right">
                      <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed border-accent/60 px-3 text-[11px] font-semibold tracking-[0.18em] text-accent uppercase">
                        <Clock className="size-3" aria-hidden />
                        {m.soon.badge}
                      </span>
                      <span className="text-[12px] font-medium tracking-[0.18em] text-muted uppercase">{g.region}</span>
                      <span className="max-h-0 max-w-56 overflow-hidden text-[12px] leading-snug text-muted opacity-0 transition-all duration-500 group-hover:max-h-20 group-hover:opacity-100">{m.soon.short}</span>
                    </span>
                  </div>
                </li>
              ) : (
              <li key={`${g.key}-${g.name}`}>
                <Link
                  href={`/order?region=${g.key}`}
                  className="group relative flex items-baseline justify-between gap-6 overflow-hidden border-b border-line py-5 transition-[padding] duration-500 ease-out hover:px-4 sm:py-7 lg:hover:px-8"
                >
                  <span className="absolute inset-0 origin-bottom scale-y-0 bg-accent transition-transform duration-500 ease-out group-hover:scale-y-100" aria-hidden />
                  <span className="relative flex items-baseline gap-5 sm:gap-8">
                    <span className="tabular hidden text-[12px] tracking-[0.2em] text-muted transition-colors duration-300 group-hover:text-on-accent/70 sm:block">{String(i + 1).padStart(2, '0')}</span>
                    <span lang={g.latin ? 'en' : undefined} className="display text-[clamp(2rem,7.2vw,6.25rem)] transition-colors duration-300 group-hover:text-on-accent">{g.name}</span>
                  </span>
                  <span className="relative flex shrink-0 items-center gap-3 text-[12px] font-medium tracking-[0.18em] text-muted uppercase transition-colors duration-300 group-hover:text-on-accent">
                    {g.region}
                    <ArrowUpRight className="size-5 -translate-x-2 opacity-0 transition-[transform,opacity] duration-500 group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
                  </span>
                </Link>
              </li>
              ),
            )}
          </ul>
          <p className="mt-6 text-[13px] text-muted">{h.markets.manual}</p>
        </Container>
      </section>

      {/* ── Combine stores, save on delivery ── */}
      <CombineSavings catalog={catalog} m={m} locale={locale} />

      {/* ── C · How it works: a horizontal journey ── */}
      <ProcessRail eyebrow={h.how.title} title={h.hero.processTitle} steps={m.steps} />

      {/* ── D · Global connection: every route at once ── */}
      <section className="border-t border-line">
        <Container className="py-20 lg:py-32">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
            <h2 className="display text-[clamp(2.2rem,5.4vw,4.75rem)]">{h.routes.title}</h2>
            <p className="max-w-md text-lg leading-relaxed text-ink-soft lg:justify-self-end">{h.routes.subtitle}</p>
          </div>
          <Reveal className="mt-12">
            <WorldMap regions={regions} labels={h.routes} soon={soonText} usdRate={catalog.rates.find((r) => r.currency === 'USD')?.rateToAzn} />
          </Reveal>
        </Container>
      </section>

      {/* ── E · Product request ── */}
      <section className="relative overflow-hidden border-t border-line">
        <div className="pointer-events-none absolute -top-40 left-1/2 size-[46rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(255_90_31/0.13),transparent)]" aria-hidden />
        <Container className="relative grid gap-12 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16 lg:py-32">
          <div>
            <h2 className="display text-[clamp(2.2rem,5vw,4.5rem)]">{h.hero.quickTitle}</h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft">{h.hero.note}</p>
            <ol className="mt-10 space-y-4">
              {m.order.sideItems.map((item, i) => (
                <li key={item} className="grid grid-cols-[2.5rem_1fr] gap-2 text-sm leading-relaxed text-ink-soft">
                  <span className="tabular pt-0.5 text-[12px] tracking-[0.18em] text-accent">0{i + 1}</span>
                  {item}
                </li>
              ))}
            </ol>
          </div>
          <Reveal>
            <RequestConsole regions={regions.map((r) => ({ key: r.key, name: r.name, soon: r.soon }))} />
          </Reveal>
        </Container>
      </section>

      {/* ── F · Trust and transparency: the quotation, line by line ── */}
      <section className="border-t border-line">
        <Container className="py-20 lg:py-32">
          <div className="grid gap-14 lg:grid-cols-[1fr_1fr] lg:gap-20">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <h2 className="display text-[clamp(2.2rem,5vw,4.5rem)]">{h.hero.trustTitle}</h2>
              <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft">{h.pricing.subtitle}</p>
              <ButtonLink href="/pricing" variant="secondary" size="lg" className="group mt-9">
                {h.pricing.link}
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
              </ButtonLink>
            </div>

            <div className="space-y-5">
              {example && (
                <Reveal className="rounded-card border border-line bg-surface p-6 sm:p-8">
                  <div className="mb-5 flex items-center justify-between">
                    <p className="font-display text-lg font-semibold">{h.hero.cardTitle}</p>
                    <Badge>{m.common.example}</Badge>
                  </div>
                  <Breakdown lines={example.lines} total={example.total} />
                  <p className="mt-5 text-[12px] text-muted">{h.hero.cardNote}</p>
                </Reveal>
              )}
              <div className="grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
                {(['estimate', 'quote', 'paid', 'extra'] as const).map((k) => (
                  <div key={k} className="bg-surface p-6">
                    <p className="font-medium">{m.pricingPage.terms[k].t}</p>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{m.pricingPage.terms[k].d}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-20 grid gap-x-12 gap-y-10 border-t border-line pt-12 md:grid-cols-3">
            {proof.map((b, i) => (
              <Reveal key={b.title} delay={i * 0.08}>
                <span className="tabular text-[12px] tracking-[0.2em] text-accent">0{i + 1}</span>
                <h3 className="display mt-4 text-2xl sm:text-3xl">{b.title}</h3>
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-soft">{b.text}</p>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Sample testimonials (demo content, labelled) ── */}
      <section className="border-t border-line">
        <Container className="py-20 lg:py-24">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold sm:text-3xl">{h.testimonials.title}</h2>
            <Badge tone="warn">{m.common.demo}</Badge>
          </div>
          <p className="mt-3 text-sm text-muted">{h.testimonials.demoNotice}</p>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {h.testimonials.items.map((t, i) => (
              <figure key={i} className="flex flex-col justify-between rounded-card border border-dashed border-line-strong p-6">
                <blockquote className="leading-relaxed text-ink-soft">“{t.quote}”</blockquote>
                <figcaption className="mt-6 flex items-center justify-between text-[13px] text-muted">
                  <span>{t.name}</span>
                  <span>{t.meta}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </Container>
      </section>

      {/* ── FAQ ── */}
      <section className="border-t border-line">
        <Container className="grid gap-10 py-20 lg:grid-cols-[0.8fr_1.2fr] lg:py-28">
          <h2 className="display text-[clamp(2rem,4vw,3.5rem)]">{h.faq.title}</h2>
          <div className="divide-y divide-line border-y border-line">
            {h.faq.items.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex items-center justify-between gap-6 py-5 text-lg font-medium transition-colors hover:text-accent">
                  {f.q}
                  <Plus className="size-5 shrink-0 text-muted transition-transform duration-300 group-open:rotate-45 group-open:text-accent" aria-hidden />
                </summary>
                <p className="max-w-2xl pb-6 text-[15px] leading-relaxed text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </Container>
      </section>

      {/* ── G · Final call ── */}
      <section className="relative overflow-hidden border-t border-line">
        {/* A planet horizon: the same world as the hero, seen from Baku. */}
        <div className="pointer-events-none absolute inset-x-0 top-[62%] mx-auto aspect-square w-[150vw] max-w-none -translate-x-[calc((150vw-100%)/2)] rounded-full border-t border-white/15 bg-[radial-gradient(closest-side,transparent_82%,rgb(255_90_31/0.16))] shadow-[0_-40px_120px_-30px_rgb(255_90_31/0.35)]" aria-hidden />
        <Container className="relative py-28 text-center lg:py-44">
          <h2 className="display text-[clamp(3rem,11vw,10rem)]">
            {h.hero.finalHeadline.map((line, i) => (
              <span key={line} className={i === 1 ? 'block text-accent' : 'block'}>
                {line}
              </span>
            ))}
          </h2>
          <p className="mx-auto mt-8 max-w-md text-lg text-ink-soft">{h.cta.text}</p>
          <ButtonLink href="/order" variant="accent" size="lg" className="group mt-10 h-15 px-9 text-base transition-[background-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_50px_-14px_rgb(255_90_31/0.7)]">
            {h.hero.finalCta}
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
          </ButtonLink>
        </Container>
      </section>
    </>
  );
}
