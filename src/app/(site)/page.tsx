import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Layers, MapPin, Plus, ReceiptText, ScanSearch, Search, ShoppingBag } from 'lucide-react';
import { Breakdown } from '@/components/breakdown';
import { HeroQuickStart } from '@/components/hero-quick-start';
import { Reveal } from '@/components/reveal';
import { Steps } from '@/components/steps';
import { Badge, ButtonLink, Card, Container, Eyebrow } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { getExampleQuote } from '@/lib/example-quote';
import { getCatalog } from '@/lib/settings';

const benefitIcons = [Search, ShoppingBag, ScanSearch, Layers, ReceiptText, MapPin];

export default async function HomePage() {
  const { m, locale } = await getI18n();
  const [example, { marketplaces }] = await Promise.all([getExampleQuote(m, locale), getCatalog()]);
  const h = m.home;

  return (
    <>
      {/* ── Hero ── */}
      <section className="overflow-hidden">
        <Container className="grid items-center gap-14 pt-14 pb-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10 lg:pt-24 lg:pb-28">
          <div>
            <Eyebrow>{h.hero.eyebrow}</Eyebrow>
            <h1 className="mt-5 text-[2.75rem] leading-[1.02] font-semibold tracking-[-0.035em] sm:text-6xl lg:text-[4.5rem]">{h.hero.title}</h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-soft">{h.hero.subtitle}</p>

            <div className="mt-9">
              <HeroQuickStart />
            </div>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <ButtonLink href="/order" size="lg">
                {h.hero.cta}
              </ButtonLink>
              <ButtonLink href="/how-it-works" variant="ghost" size="lg">
                {h.hero.cta2}
                <ArrowRight className="size-4" aria-hidden />
              </ButtonLink>
            </div>
            <p className="mt-6 max-w-md text-[13px] text-muted">{h.hero.note}</p>
          </div>

          {/* Product UI as the hero visual: an example quotation, clearly labelled. */}
          {example && (
            <Reveal className="relative mx-auto w-full max-w-md lg:mr-0">
              <div className="absolute -inset-x-6 -top-6 -bottom-6 -z-10 rounded-[2rem] bg-accent-soft/70" aria-hidden />
              <Card className="p-6 shadow-float sm:p-7">
                <div className="mb-4 flex items-center justify-between">
                  <p className="font-display text-lg font-semibold">{h.hero.cardTitle}</p>
                  <Badge>{m.common.example}</Badge>
                </div>
                <Breakdown lines={example.lines} total={example.total} />
                <p className="mt-5 text-[12px] text-muted">{h.hero.cardNote}</p>
              </Card>
            </Reveal>
          )}
        </Container>
      </section>

      {/* ── Marketplaces ── */}
      <section className="border-y border-line bg-surface">
        <Container className="py-16 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-end">
            <div>
              <h2 className="text-3xl font-semibold sm:text-4xl">{h.markets.title}</h2>
              <p className="mt-4 max-w-md text-ink-soft">{h.markets.subtitle}</p>
            </div>
            <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-3">
              {[...marketplaces.filter((x) => x.enabled).map((x) => x.name), ...h.markets.intl].map((name, i) => (
                <li key={name} className="flex min-h-20 items-center bg-surface px-5 py-4">
                  <span className={i < marketplaces.filter((x) => x.enabled).length ? 'font-display text-xl font-semibold tracking-tight' : 'text-sm text-ink-soft'}>{name}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-6 text-[13px] text-muted">{h.markets.manual}</p>
        </Container>
      </section>

      {/* ── How it works ── */}
      <section>
        <Container className="py-20 lg:py-28">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-semibold sm:text-4xl">{h.how.title}</h2>
              <p className="mt-3 text-ink-soft">{h.how.subtitle}</p>
            </div>
            <Link href="/how-it-works" className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline">
              {m.nav.how}
              <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          </div>
          <Reveal>
            <Steps steps={m.steps} />
          </Reveal>
        </Container>
      </section>

      {/* ── Pricing explanation ── */}
      <section className="bg-ink text-white">
        <Container className="grid gap-12 py-20 lg:grid-cols-2 lg:items-center lg:py-28">
          <div>
            <h2 className="text-3xl font-semibold sm:text-4xl">{h.pricing.title}</h2>
            <p className="mt-4 max-w-md text-white/70">{h.pricing.subtitle}</p>
            <ul className="mt-8 space-y-3 text-[15px]">
              {(['product', 'domestic', 'international', 'service', 'customs'] as const).map((k, i) => (
                <li key={k} className="flex items-center gap-3">
                  <span className="tabular flex size-6 items-center justify-center rounded-full border border-white/25 text-[11px] text-white/70">{i === 0 ? '' : '+'}</span>
                  {m.pricingPage.lines[k]}
                </li>
              ))}
              <li className="flex items-center gap-3 border-t border-white/15 pt-4 font-medium">
                <span className="flex size-6 items-center justify-center rounded-full bg-white text-[11px] text-ink">=</span>
                {m.pricingPage.lines.total}
              </li>
            </ul>
            <ButtonLink href="/pricing" variant="secondary" className="mt-9 border-white/0">
              {h.pricing.link}
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
          <div className="grid gap-px overflow-hidden rounded-card border border-white/15 bg-white/15 sm:grid-cols-2">
            {(['estimate', 'quote', 'paid', 'extra'] as const).map((k) => (
              <div key={k} className="bg-ink p-6">
                <p className="font-medium">{m.pricingPage.terms[k].t}</p>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{m.pricingPage.terms[k].d}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Benefits ── */}
      <section>
        <Container className="py-20 lg:py-28">
          <div className="max-w-xl">
            <h2 className="text-3xl font-semibold sm:text-4xl">{h.benefits.title}</h2>
            <p className="mt-3 text-ink-soft">{h.benefits.subtitle}</p>
          </div>
          <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {h.benefits.items.map((b, i) => {
              const Icon = benefitIcons[i % benefitIcons.length];
              return (
                <Reveal key={b.title} delay={(i % 3) * 0.06}>
                  <div className="border-t border-line-strong pt-6">
                    <Icon className="size-5 text-accent" strokeWidth={1.75} aria-hidden />
                    <h3 className="mt-4 text-lg font-semibold">{b.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{b.text}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </Container>
      </section>

      {/* ── Testimonials (demo content, labelled) ── */}
      <section className="border-y border-line bg-surface">
        <Container className="py-20 lg:py-24">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-3xl font-semibold sm:text-4xl">{h.testimonials.title}</h2>
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
      <section>
        <Container className="grid gap-10 py-20 lg:grid-cols-[0.8fr_1.2fr] lg:py-28">
          <h2 className="text-3xl font-semibold sm:text-4xl">{h.faq.title}</h2>
          <div className="divide-y divide-line border-y border-line">
            {h.faq.items.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex items-center justify-between gap-6 py-5 font-medium">
                  {f.q}
                  <Plus className="size-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-45" aria-hidden />
                </summary>
                <p className="max-w-2xl pb-6 text-[15px] leading-relaxed text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </Container>
      </section>

      {/* ── Closing CTA ── */}
      <section>
        <Container>
          <div className="flex flex-col items-start justify-between gap-8 rounded-[1.75rem] bg-accent px-7 py-12 text-white sm:px-12 lg:flex-row lg:items-center lg:py-14">
            <div>
              <h2 className="text-3xl font-semibold sm:text-4xl">{h.cta.title}</h2>
              <p className="mt-3 text-white/75">{h.cta.text}</p>
            </div>
            <ButtonLink href="/order" variant="secondary" size="lg" className="border-white/0">
              {h.cta.button}
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
          </div>
        </Container>
      </section>
    </>
  );
}
