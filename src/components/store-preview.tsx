import { formatAzn, formatNumber } from '@/lib/format';

/** The photo and original price read from the store page when the order was placed (read-only, for reference). */
export function StorePreview({
  imageUrl,
  price,
  currency,
  storeName,
  labels,
  locale,
  rateToAzn,
}: {
  imageUrl: string | null;
  price: number | null;
  currency: string | null;
  storeName: string | null;
  labels: { price: string; note: string };
  locale: string;
  /** Today's rate for `currency`, to show an AZN equivalent next to a foreign price. */
  rateToAzn?: number;
}) {
  if (!imageUrl && price === null) return null;
  return (
    <div className="mt-4 flex gap-4 rounded-card border border-line bg-paper p-3">
      {imageUrl && (
        <div className="size-24 shrink-0 overflow-hidden rounded-[0.9rem] border border-line bg-raised sm:size-28">
          {/* eslint-disable-next-line @next/next/no-img-element -- remote store CDN */}
          <img src={imageUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-full object-contain" />
        </div>
      )}
      <div className="flex min-w-0 flex-col justify-center gap-1.5">
        {storeName && <span className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">{storeName}</span>}
        {price !== null && (
          <p className="tabular font-display text-2xl font-semibold tracking-tight">
            {formatNumber(price, locale)} <span className="text-sm font-medium text-ink-soft">{currency}</span>
            {rateToAzn && currency !== 'AZN' && <span className="ml-2 text-sm font-medium text-muted">≈ {formatAzn(price * rateToAzn, locale)}</span>}
          </p>
        )}
        <p className="text-[12px] leading-relaxed text-muted">
          <span className="text-ink-soft">{labels.price}{labels.note ? "." : ""}</span> {labels.note}
        </p>
      </div>
    </div>
  );
}
