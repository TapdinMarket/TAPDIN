import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import type { Messages } from '@/i18n/messages/en';
import { formatAzn, formatMoney } from '@/lib/format';
import { MediaGrid } from './order-view';
import { Row } from './ui';

type Decimalish = { toString(): string } | number | null;
type Media = { id: string; mimeType: string; itemId: string | null; kind: string };

export type OrderItemRow = {
  id: string;
  method: 'URL' | 'IMAGE';
  sourceUrl: string | null;
  sourceMarketplace: string | null;
  title: string | null;
  description: string | null;
  variant: string | null;
  sizeColor: string | null;
  quantity: number;
  note: string | null;
  clientPrice: Decimalish;
  clientCurrency: string | null;
  previewImageUrl: string | null;
  previewPrice: Decimalish;
  previewCurrency: string | null;
  unavailable: boolean;
  resolution: string | null;
};

/**
 * The items of one order, numbered. Shared by the customer page and the admin page; `extra` lets the admin add
 * per-item controls. Prices the customer typed or the store page showed are informational (with an AZN equivalent).
 */
export function OrderItems({
  items,
  media,
  marketplaces,
  rates,
  m,
  locale,
  clientPriceLabel,
  extra,
}: {
  items: OrderItemRow[];
  media: Media[];
  marketplaces: { key: string; name: string }[];
  rates: Record<string, number>;
  m: Messages;
  locale: string;
  clientPriceLabel: string;
  extra?: (item: OrderItemRow) => ReactNode;
}) {
  const d = m.detail;
  const money = (amount: Decimalish, currency: string | null) => {
    if (amount == null || !currency) return null;
    const value = Number(amount);
    const rate = rates[currency];
    return `${formatMoney(value, currency, locale)}${rate && currency !== 'AZN' ? ` ≈ ${formatAzn(value * rate, locale)}` : ''}`;
  };

  return (
    <ol className="space-y-4">
      {items.map((item, index) => {
        const photos = media.filter((x) => x.itemId === item.id);
        const store = marketplaces.find((x) => x.key === item.sourceMarketplace)?.name ?? (item.method === 'IMAGE' ? m.dash.photoRequest : d.unknownSource);
        const clientPrice = money(item.clientPrice, item.clientCurrency);
        const storePrice = money(item.previewPrice, item.previewCurrency);
        return (
          <li key={item.id} className={item.unavailable ? 'rounded-card border border-dashed border-line-strong p-4 opacity-70 sm:p-5' : 'rounded-card border border-line bg-paper/40 p-4 sm:p-5'}>
            <div className="flex items-start gap-3">
              <span className="tabular flex size-7 shrink-0 items-center justify-center rounded-full border border-line-strong text-[12px] font-semibold">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className={item.unavailable ? 'font-medium break-words line-through decoration-muted' : 'font-medium break-words'}>{item.title ?? item.description}</p>
                <p className="mt-0.5 text-[12px] font-medium tracking-[0.14em] text-muted uppercase">{store}</p>
              </div>
              {item.unavailable && (
                <span className="shrink-0 rounded-full bg-danger-soft px-2.5 py-1 text-[11px] font-semibold tracking-[0.1em] text-danger uppercase">
                  {item.resolution === 'REPLACED' ? m.admin.order.replacedBadge : item.resolution === 'REMOVED' ? m.admin.order.removedBadge : m.admin.order.unavailableBadge}
                </span>
              )}
            </div>
            {item.unavailable && (
              <p className="mt-2 text-[13px] text-muted">
                {item.resolution === 'REPLACED' ? d.decision.replacedNote : item.resolution === 'REMOVED' ? d.decision.removed : d.unavailableNote}
              </p>
            )}
            <dl className="mt-3 divide-y divide-line">
              {item.sourceUrl && (
                <Row label={d.link}>
                  <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex max-w-full items-center gap-1.5 font-medium break-all underline underline-offset-4">
                    {new URL(item.sourceUrl).hostname.replace(/^www\./, '')}
                    <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                  </a>
                </Row>
              )}
              <Row label={d.quantity}>{item.quantity}</Row>
              {item.variant && <Row label={d.variant}>{item.variant}</Row>}
              {item.sizeColor && <Row label={d.sizeColor}>{item.sizeColor}</Row>}
              {item.title && item.description && <Row label={d.description}><span className="whitespace-pre-line">{item.description}</span></Row>}
              {clientPrice && <Row label={clientPriceLabel}><span className="tabular">{clientPrice}</span></Row>}
              {storePrice && <Row label={d.storePrice}><span className="tabular">{storePrice}</span></Row>}
              {item.note && <Row label={d.instructions}><span className="whitespace-pre-line">{item.note}</span></Row>}
            </dl>
            {photos.length > 0 && <MediaGrid media={photos} className="mt-3 sm:grid-cols-4" />}
            {extra?.(item)}
          </li>
        );
      })}
    </ol>
  );
}
