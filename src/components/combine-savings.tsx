import { ArrowRight, Package } from 'lucide-react';
import type { Messages } from '@/i18n/messages/en';
import { formatAzn } from '@/lib/format';
import { estimateBasket } from '@/lib/pricing/engine';
import type { Catalog } from '@/lib/settings';
import { isOrderable } from '@/lib/regions';
import { ButtonLink, Container } from './ui';

/**
 * "Order together, save on delivery". The example is computed from the configured China rules with the same
 * engine as the order form, so the numbers always match the current tariffs. Hidden if China is not orderable.
 */
export function CombineSavings({ catalog, m, locale, compact = false }: { catalog: Catalog; m: Messages; locale: string; compact?: boolean }) {
  const region = catalog.regions.find((r) => r.key === 'CN' && isOrderable(r));
  const usd = catalog.rates.find((r) => r.currency === 'USD')?.rateToAzn;
  if (!region || !usd) return null;
  const est = estimateBasket({
    items: [0, 1, 2].map(() => ({ priceAzn: 20, weightKg: 0.3 })),
    commissionPercent: region.commissionPercent,
    minCommissionAzn: region.minCommissionAzn,
    minBillableWeightKg: region.minBillableWeightKg,
    cargoPerKgUsd: region.cargoPerKgUsd,
    usdRate: usd,
  });
  if (est.savings <= 0) return null;
  const c = m.combine;
  const stores = catalog.marketplaces.filter((x) => x.enabled && x.regionKey === region.key).map((x) => x.name);

  const panel = (
    <div className="rounded-card border border-line bg-surface p-6 sm:p-7">
      <p className="text-[12px] font-medium tracking-[0.14em] text-muted uppercase">{c.example}</p>
      <div className="mt-5 space-y-3">
        <div className="flex items-baseline justify-between gap-4 text-ink-soft">
          <span>{c.separately}</span>
          <span className="tabular text-lg line-through decoration-muted">{formatAzn(est.separately, locale)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-medium">{c.together}</span>
          <span className="tabular font-display text-3xl font-semibold tracking-tight">{formatAzn(est.together, locale)}</span>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-control bg-accent px-4 py-3 text-on-accent">
          <span className="text-sm font-semibold uppercase tracking-[0.12em]">{c.save}</span>
          <span className="tabular font-display text-2xl font-semibold">− {formatAzn(est.savings, locale)}</span>
        </div>
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-muted">{c.note}</p>
    </div>
  );

  if (compact) {
    return (
      <section className="mt-16">
        <h2 className="text-2xl font-semibold">{c.title}</h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-ink-soft">{c.text}</p>
        <div className="mt-6 max-w-xl">{panel}</div>
      </section>
    );
  }

  return (
    <section className="border-t border-line">
      <Container className="grid gap-12 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-16 lg:py-28">
        <div>
          <p className="text-[12px] font-medium tracking-[0.2em] text-accent uppercase">{c.eyebrow}</p>
          <h2 className="display mt-4 text-[clamp(2.2rem,5vw,4.5rem)]">{c.title}</h2>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-soft">{c.text}</p>
          {/* Stores flowing into one parcel */}
          <div className="mt-8 flex flex-wrap items-center gap-2" aria-hidden>
            {stores.map((s) => (
              <span key={s} lang="en" className="rounded-full border border-line-strong px-3 py-1.5 text-[12px] font-semibold tracking-[0.12em] uppercase">
                {s}
              </span>
            ))}
            <ArrowRight className="mx-1 size-4 text-accent" />
            <span className="flex items-center gap-2 rounded-full bg-accent px-3.5 py-1.5 text-[12px] font-semibold tracking-[0.12em] text-on-accent uppercase">
              <Package className="size-3.5" />1
            </span>
          </div>
          <ButtonLink href="/order" variant="accent" size="lg" className="mt-9">
            {c.cta}
            <ArrowRight className="size-4" aria-hidden />
          </ButtonLink>
        </div>
        {panel}
      </Container>
    </section>
  );
}
