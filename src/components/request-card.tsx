'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { animate, AnimatePresence, motion, useMotionValue, useTransform } from 'motion/react';
import { ImagePlus, Link2, X } from 'lucide-react';
import { useI18n } from '@/i18n/client';
import { cn, formatAzn, formatNumber } from '@/lib/format';
import { calculateQuote, suggestCargoAzn, type CommissionBasis } from '@/lib/pricing/engine';

const EASE = [0.22, 1, 0.36, 1] as const;
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 8 * 1024 * 1024;

export type SizeKey = 'S' | 'M' | 'L';
const SIZE_KG: Record<SizeKey, number> = { S: 0.5, M: 1.5, L: 4 };

export type EstimateRegion = { currency: string; commissionPercent: number; minCommissionAzn: number; cargoPerKgUsd: number; minBillableWeightKg: number };
export type Pricing = { regions: Record<string, EstimateRegion>; rates: Record<string, number>; basis: CommissionBasis };
export type CardValue = { screenshot: { file: File; preview: string } | null; price: string; currency: string; size: SizeKey };

function AnimatedAzn({ value }: { value: number }) {
  const { locale } = useI18n();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => formatNumber(v, locale));
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.7, ease: EASE });
    return () => c.stop();
  }, [mv, value]);
  return (
    <p className="tabular flex items-baseline gap-2 font-display text-[clamp(2rem,6vw,2.75rem)] leading-none font-semibold tracking-[-0.03em]">
      <span className="text-[0.55em] text-muted">≈</span>
      <motion.span>{text}</motion.span>
      <span className="text-[0.6em] text-accent">₼</span>
    </p>
  );
}

/**
 * The request card: grows out of the link field. The customer adds a screenshot and the store price;
 * the site shows a live estimate in AZN using the same pricing engine as the server (clearly an estimate —
 * the binding quotation is still calculated by staff on the server).
 */
export function RequestCard({
  variant = 'link',
  storeName,
  regionKey,
  quantity,
  pricing,
  value,
  onChange,
  onChangeLink,
  showEstimate = true,
}: {
  /** `photo`: the photos are uploaded above, there is no store — only price, size and the estimate. */
  variant?: 'link' | 'photo';
  storeName: string;
  regionKey: string | null;
  quantity: number;
  pricing: Pricing;
  value: CardValue;
  onChange: (next: CardValue) => void;
  onChangeLink: () => void;
  /** In a multi-item order the estimate is shown once for the whole basket instead. */
  showEstimate?: boolean;
}) {
  const { m, locale } = useI18n();
  const c = m.order.card;
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const latest = useRef(value);
  latest.current = value;

  function takeFile(file: File | null | undefined) {
    if (!file) return;
    if (!ACCEPT.includes(file.type)) return setFileError(m.order.fileType);
    if (file.size > MAX_BYTES) return setFileError(m.order.fileSize);
    setFileError(null);
    if (latest.current.screenshot) URL.revokeObjectURL(latest.current.screenshot.preview);
    onChange({ ...latest.current, screenshot: { file, preview: URL.createObjectURL(file) } });
  }

  // Ctrl+V anywhere on the page: an image on the clipboard becomes the screenshot. Text pastes are untouched.
  useEffect(() => {
    if (variant !== 'link') return;
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === 'file' && ACCEPT.includes(i.type));
      if (!item) return;
      e.preventDefault();
      takeFile(item.getAsFile());
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const region = regionKey ? pricing.regions[regionKey] : undefined;
  const typed = Number(value.price.replace(/\s/g, '').replace(',', '.'));
  const unitAzn = value.price.trim() && Number.isFinite(typed) && typed > 0 && pricing.rates[value.currency] ? typed * pricing.rates[value.currency] : null;
  // AZN first, then the foreign currencies with a maintained rate.
  const currencies = useMemo(() => ['AZN', ...Object.keys(pricing.rates).filter((c) => c !== 'AZN').sort()], [pricing.rates]);

  const estimate = useMemo(() => {
    const unit = Number(value.price.replace(/\s/g, '').replace(',', '.'));
    if (!value.price.trim() || !Number.isFinite(unit) || unit <= 0) return { state: 'empty' as const };
    if (!region) return { state: 'region' as const };
    const rate = pricing.rates[value.currency];
    const usd = pricing.rates.USD;
    if (!rate || !usd) return { state: 'rate' as const };
    const qty = Math.max(1, quantity || 1);
    const b = calculateQuote({
      unitPrice: unit,
      quantity: qty,
      domesticShipping: 0,
      exchangeRate: rate,
      internationalShippingAzn: suggestCargoAzn({ weightKg: SIZE_KG[value.size] * qty, minBillableWeightKg: region.minBillableWeightKg, cargoPerKgUsd: region.cargoPerKgUsd, usdRate: usd }),
      commissionPercent: region.commissionPercent,
      commissionBasis: pricing.basis,
      minCommissionAzn: region.minCommissionAzn,
      sourcingFeeAzn: 0,
      customsChargesAzn: 0,
      otherExpensesAzn: 0,
    });
    return { state: 'ok' as const, total: b.totalAzn };
  }, [value.price, value.currency, value.size, region, pricing, quantity]);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="overflow-hidden"
    >
      <div className={cn('grid gap-5 rounded-card border border-line-strong bg-paper p-4 sm:p-5', variant === 'link' && 'sm:grid-cols-[13rem_1fr]')}>
        {/* ── screenshot ── */}
        {variant === 'link' && (
        <div>
          <div
            role="button"
            tabIndex={0}
            aria-label={c.screenshotPick}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              takeFile(e.dataTransfer.files[0]);
            }}
            className={cn(
              'group relative flex aspect-[16/10] w-full cursor-pointer sm:aspect-square items-center justify-center overflow-hidden rounded-[1rem] border transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
              value.screenshot ? 'border-line bg-raised' : dragging ? 'border-accent bg-accent-soft' : 'border-dashed border-line-strong bg-raised/60 hover:border-ink/40',
            )}
          >
            <AnimatePresence mode="wait" initial={false}>
              {value.screenshot ? (
                <motion.img
                  key={value.screenshot.preview}
                  src={value.screenshot.preview}
                  alt=""
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, ease: EASE }}
                  className="absolute inset-0 size-full object-contain"
                />
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-2 px-4 text-center">
                  <ImagePlus className="size-6 text-accent" strokeWidth={1.5} aria-hidden />
                  <span className="text-sm font-medium">{c.screenshot}</span>
                  <span className="text-[12px] leading-snug text-muted">{c.screenshotHint}</span>
                </motion.div>
              )}
            </AnimatePresence>
            {value.screenshot && (
              <button
                type="button"
                aria-label={c.remove}
                onClick={(e) => {
                  e.stopPropagation();
                  URL.revokeObjectURL(value.screenshot!.preview);
                  onChange({ ...value, screenshot: null });
                }}
                className="absolute top-2 right-2 flex size-7 cursor-pointer items-center justify-center rounded-full bg-black/70 text-ink opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT.join(',')}
            hidden
            onChange={(e) => {
              takeFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {fileError && <p className="mt-2 text-[12px] text-danger">{fileError}</p>}
        </div>
        )}

        {/* ── price, size, estimate ── */}
        <div className="flex min-w-0 flex-col gap-5">
          {variant === 'link' && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex h-7 w-fit items-center gap-2 rounded-full border border-line-strong bg-surface px-3 text-[11px] font-semibold tracking-[0.16em] uppercase">
              <span className="flex size-4 items-center justify-center rounded-[5px] bg-accent text-[9px] leading-none font-bold text-on-accent" aria-hidden>
                {storeName.slice(0, 1).toUpperCase()}
              </span>
              {storeName}
            </span>
            <button type="button" onClick={onChangeLink} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-ink-soft transition-colors hover:bg-ink/8 hover:text-ink">
              <Link2 className="size-3.5" aria-hidden />
              {c.change}
            </button>
          </div>
          )}

          <div>
            <p className="text-[11px] font-medium tracking-[0.16em] text-muted uppercase">
              {variant === 'photo' ? c.priceKnown : c.price} <span className="tracking-normal normal-case">· {c.optional}</span>
            </p>
            <div className="mt-2 flex items-stretch gap-2">
              <input
                inputMode="decimal"
                placeholder="0,00"
                value={value.price}
                onChange={(e) => onChange({ ...value, price: e.target.value.replace(/[^\d.,\s]/g, '').slice(0, 14) })}
                aria-label={c.price}
                className="tabular h-14 min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-4 font-display text-2xl font-semibold tracking-tight placeholder:text-muted/40 focus:border-accent focus:outline-none"
              />
              <select
                value={value.currency}
                onChange={(e) => onChange({ ...value, currency: e.target.value })}
                aria-label={c.currency}
                className="h-14 cursor-pointer rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold focus:border-accent focus:outline-none"
              >
                {currencies.map((cur) => (
                  <option key={cur} value={cur}>
                    {cur}
                  </option>
                ))}
              </select>
            </div>
            {unitAzn !== null && value.currency !== 'AZN' && <p className="tabular mt-2 text-[13px] text-ink-soft">≈ {formatAzn(unitAzn, locale)}</p>}
          </div>

          <fieldset>
            <legend className="text-[11px] font-medium tracking-[0.16em] text-muted uppercase">{c.size}</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(Object.keys(SIZE_KG) as SizeKey[]).map((k) => (
                <label
                  key={k}
                  className={cn(
                    'flex h-9 cursor-pointer items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors has-focus-visible:outline-2 has-focus-visible:outline-ink',
                    value.size === k ? 'border-accent bg-accent text-on-accent' : 'border-line-strong text-ink-soft hover:border-ink/40',
                  )}
                >
                  <input type="radio" name="card-size" value={k} checked={value.size === k} onChange={() => onChange({ ...value, size: k })} className="sr-only" />
                  {c.sizes[k]}
                </label>
              ))}
            </div>
          </fieldset>

          {showEstimate && (
          <div className="rounded-control border border-line bg-surface p-4" aria-live="polite">
            <p className="text-[11px] font-medium tracking-[0.16em] text-muted uppercase">{c.estimate}</p>
            <div className="mt-2 min-h-11">
              {estimate.state === 'ok' ? (
                <AnimatedAzn value={estimate.total} />
              ) : (
                <p className="pt-2 text-[13px] leading-relaxed text-ink-soft">
                  {estimate.state === 'empty' ? c.estimateEmpty : estimate.state === 'region' ? c.estimateRegion : c.estimateNoRate}
                </p>
              )}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">{c.estimateNote}</p>
          </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
