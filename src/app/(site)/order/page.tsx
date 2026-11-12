import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OrderForm } from '@/components/order-form';
import { Container, Eyebrow } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { getCurrentUser } from '@/lib/auth';
import { getCatalog } from '@/lib/settings';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.order.title };
}

export default async function OrderPage({ searchParams }: { searchParams: Promise<{ url?: string; mode?: string }> }) {
  const [{ m }, user, params, catalog] = await Promise.all([getI18n(), getCurrentUser(), searchParams, getCatalog()]);
  const initialUrl = typeof params.url === 'string' ? params.url.slice(0, 2000) : '';
  const initialMode = params.mode === 'image' ? 'IMAGE' : 'URL';

  if (!user) {
    const query = new URLSearchParams();
    if (initialUrl) query.set('url', initialUrl);
    if (initialMode === 'IMAGE') query.set('mode', 'image');
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
            regions={catalog.regions.filter((r) => r.enabled).map((r) => ({ key: r.key, name: r.name }))}
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
