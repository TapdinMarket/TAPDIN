import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OrderForm } from '@/components/order-form';
import { Container, Eyebrow } from '@/components/ui';
import { regionLabel } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { getCurrentUser } from '@/lib/auth';
import { isOrderable, isPublic } from '@/lib/regions';
import { getCatalog, getSettings } from '@/lib/settings';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.order.title };
}

export default async function OrderPage({ searchParams }: { searchParams: Promise<{ url?: string; mode?: string; region?: string }> }) {
  const [{ m }, user, params, catalog, settings] = await Promise.all([getI18n(), getCurrentUser(), searchParams, getCatalog(), getSettings()]);
  const initialUrl = typeof params.url === 'string' ? params.url.slice(0, 2000) : '';
  const initialMode = params.mode === 'image' ? 'IMAGE' : 'URL';
  const regions = catalog.regions.filter(isPublic);
  // A coming-soon region is never preselected: it cannot be ordered from.
  const initialRegion = regions.find((r) => r.key === params.region && isOrderable(r))?.key ?? '';

  if (!user) {
    const query = new URLSearchParams();
    if (initialUrl) query.set('url', initialUrl);
    if (initialMode === 'IMAGE') query.set('mode', 'image');
    if (initialRegion) query.set('region', initialRegion);
    const next = `/order${query.size ? `?${query}` : ''}`;
    redirect(`/register?next=${encodeURIComponent(next)}`);
  }

  return (
    <Container className="py-10 lg:py-16">
      <div className="grid gap-10 lg:grid-cols-[1fr_20rem] lg:gap-14">
        <div>
          <Eyebrow>{m.nav.order}</Eyebrow>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{m.order.title}</h1>
          <p className="mt-2 mb-8 text-ink-soft">{m.order.subtitle}</p>
          <OrderForm
            marketplaces={catalog.marketplaces.filter((x) => x.enabled)}
            regions={regions.map((r) => ({ key: r.key, name: regionLabel(m, r), soon: !isOrderable(r) }))}
            initialRegion={initialRegion}
            pricing={{
              // Only orderable regions get an estimate; announced ones have no prices yet.
              regions: Object.fromEntries(
                regions
                  .filter(isOrderable)
                  .map((r) => [r.key, { currency: r.defaultCurrency, commissionPercent: r.commissionPercent, minCommissionAzn: r.minCommissionAzn, cargoPerKgUsd: r.cargoPerKgUsd, minBillableWeightKg: r.minBillableWeightKg }]),
              ),
              // AZN is always available: 1 AZN = 1 AZN.
              rates: { AZN: 1, ...Object.fromEntries(catalog.rates.map((r) => [r.currency, r.rateToAzn])) },
              basis: settings.general.commissionBasis,
            }}
            initialUrl={initialUrl}
            initialMode={initialMode}
          />
        </div>
        <aside className="lg:pt-32">
          <h2 className="text-[15px] font-semibold">{m.order.sideTitle}</h2>
          <ol className="mt-5 space-y-5">
            {m.order.sideItems.map((item, i) => (
              <li key={item} className="grid grid-cols-[1.75rem_1fr] gap-3 text-sm leading-relaxed text-ink-soft">
                <span className="tabular flex size-7 items-center justify-center rounded-full border border-line-strong text-[12px] font-medium text-ink">{i + 1}</span>
                {item}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </Container>
  );
}
