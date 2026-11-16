'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, Camera, Check, ChevronDown, Clock, ImagePlus, Link2, Plus, ScanSearch, Trash2, X } from 'lucide-react';
import { useI18n } from '@/i18n/client';
import { cn, fmt, formatAzn } from '@/lib/format';
import { detectMarketplace, parseHttpUrl, type MarketplaceInfo } from '@/lib/marketplaces';
import { estimateBasket } from '@/lib/pricing/engine';
import { RequestCard, type CardValue, type Pricing, type SizeKey } from './request-card';
import { Button, buttonClass, Card, Field, Input, Select, Textarea } from './ui';

const MAX_FILES = 6;
const MAX_ITEMS = 20;
const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
const SIZE_KG: Record<SizeKey, number> = { S: 0.5, M: 1.5, L: 4 };
const EASE = [0.22, 1, 0.36, 1] as const;

type Mode = 'URL' | 'IMAGE';
type Picked = { file: File; preview: string };
type Item = {
  key: number;
  mode: Mode;
  url: string;
  title: string;
  variant: string;
  description: string;
  sizeColor: string;
  quantity: string;
  images: Picked[];
  card: CardValue;
  currencyTouched: boolean;
};
type Region = { key: string; name: string; soon: boolean };

let nextKey = 1;
const blankItem = (mode: Mode, url = ''): Item => ({
  key: nextKey++,
  mode,
  url,
  title: '',
  variant: '',
  description: '',
  sizeColor: '',
  quantity: '1',
  images: [],
  card: { screenshot: null, price: '', currency: '', size: 'S' },
  currencyTouched: false,
});

const parsePrice = (raw: string) => {
  const n = Number(raw.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Order form = a basket. Any number of items (store links and photo requests mixed) from ONE sourcing region:
 * they arrive at one warehouse and ship as one parcel. The form shows what combining saves (one cargo minimum,
 * one commission minimum) using the pricing engine — an estimate only; the server prices the quotation.
 */
export function OrderForm({
  marketplaces,
  regions,
  initialUrl,
  initialMode,
  initialRegion,
  pricing,
}: {
  marketplaces: MarketplaceInfo[];
  /** `soon`: announced region, closed for orders (Region.status COMING_SOON). */
  regions: Region[];
  initialUrl: string;
  initialMode: Mode;
  initialRegion: string;
  /** Region rates and exchange rates for the live AZN estimate (display only). */
  pricing: Pricing;
}) {
  const { m, locale } = useI18n();
  const o = m.order;
  const c = o.cart;
  const [items, setItems] = useState<Item[]>(() => [blankItem(initialMode, initialUrl)]);
  const [open, setOpen] = useState(0);
  const [regionKey, setRegionKey] = useState(initialRegion);
  const [instructions, setInstructions] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ id: string; number: string } | null>(null);

  // Free object URLs when the form goes away.
  const latest = useRef(items);
  latest.current = items;
  useEffect(
    () => () =>
      latest.current.forEach((i) => {
        i.images.forEach((p) => URL.revokeObjectURL(p.preview));
        if (i.card.screenshot) URL.revokeObjectURL(i.card.screenshot.preview);
      }),
    [],
  );

  const update = (index: number, patch: Partial<Item>) => setItems((list) => list.map((it, i) => (i === index ? { ...it, ...patch } : it)));

  // ── region: detected from store links, else chosen once for the whole order ──
  const detected = items.map((it) => (it.mode === 'URL' && parseHttpUrl(it.url) ? detectMarketplace(it.url, marketplaces) : null));
  const detectedRegionKeys = detected.map((d) => d?.regionKey ?? null);
  const orderRegionKey = detectedRegionKeys.find(Boolean) ?? (regionKey || null);
  const orderRegion = regions.find((r) => r.key === orderRegionKey) ?? null;
  const regionName = (key: string | null) => regions.find((r) => r.key === key)?.name ?? key ?? '';
  const mismatch = (i: number) => !!detectedRegionKeys[i] && !!orderRegionKey && detectedRegionKeys[i] !== orderRegionKey;
  const anyMismatch = items.some((_, i) => mismatch(i));
  const soon = orderRegion?.soon ? orderRegion : null;

  const currencyFor = (it: Item) =>
    it.currencyTouched ? it.card.currency : (orderRegionKey && pricing.regions[orderRegionKey]?.currency) || it.card.currency || 'USD';

  // ── validation ──
  const problems = (it: Item, i: number) => {
    const list: string[] = [];
    if (it.mode === 'URL') {
      if (!parseHttpUrl(it.url)) list.push(o.invalidUrl);
      if (it.title.trim().length < 2) list.push(o.needTitle);
    } else {
      if (it.images.length === 0) list.push(o.needImage);
      if (it.description.trim().length < 3) list.push(o.needDescription);
    }
    if (mismatch(i)) list.push(fmt(c.mixed, { item: regionName(detectedRegionKeys[i]), order: regionName(orderRegionKey) }));
    return list;
  };

  // ── basket estimate and savings ──
  const basket = useMemo(() => {
    const region = orderRegionKey ? pricing.regions[orderRegionKey] : undefined;
    const usd = pricing.rates.USD;
    if (!region || !usd) return null;
    const priced = items
      .map((it) => {
        const price = parsePrice(it.card.price);
        const rate = pricing.rates[currencyFor(it)];
        const qty = Math.max(1, Number(it.quantity) || 1);
        return price && rate ? { priceAzn: price * rate * qty, weightKg: SIZE_KG[it.card.size] * qty } : null;
      })
      .filter((x): x is { priceAzn: number; weightKg: number } => x !== null);
    if (priced.length === 0) return { priced: 0 } as const;
    return {
      priced: priced.length,
      ...estimateBasket({ items: priced, commissionPercent: region.commissionPercent, minCommissionAzn: region.minCommissionAzn, minBillableWeightKg: region.minBillableWeightKg, cargoPerKgUsd: region.cargoPerKgUsd, usdRate: usd }),
    };
  }, [items, orderRegionKey, pricing]); // eslint-disable-line react-hooks/exhaustive-deps

  function addItem(mode: Mode) {
    if (items.length >= MAX_ITEMS) return;
    setItems((list) => [...list, blankItem(mode)]);
    setOpen(items.length);
    setShowErrors(false);
  }

  function removeItem(index: number) {
    const it = items[index];
    it.images.forEach((p) => URL.revokeObjectURL(p.preview));
    if (it.card.screenshot) URL.revokeObjectURL(it.card.screenshot.preview);
    setItems((list) => list.filter((_, i) => i !== index));
    setOpen((cur) => Math.max(0, cur > index ? cur - 1 : Math.min(cur, items.length - 2)));
  }

  async function submit() {
    setServerError(null);
    const firstBad = items.findIndex((it, i) => problems(it, i).length > 0);
    if (firstBad >= 0 || soon) {
      setShowErrors(true);
      if (firstBad >= 0) setOpen(firstBad);
      return;
    }
    const body = new FormData();
    body.set('itemCount', String(items.length));
    body.set('regionKey', detectedRegionKeys.some(Boolean) ? '' : regionKey);
    body.set('instructions', instructions);
    items.forEach((it, i) => {
      const p = `items.${i}.`;
      body.set(`${p}method`, it.mode);
      body.set(`${p}quantity`, String(Math.max(1, Number(it.quantity) || 1)));
      body.set(`${p}sizeColor`, it.sizeColor);
      if (it.card.price.trim()) {
        body.set(`${p}clientPrice`, it.card.price.replace(/\s/g, ''));
        body.set(`${p}clientCurrency`, currencyFor(it));
      }
      if (it.mode === 'URL') {
        body.set(`${p}sourceUrl`, it.url.trim());
        body.set(`${p}title`, it.title);
        body.set(`${p}variant`, it.variant);
        if (it.card.screenshot) body.append(`${p}images`, it.card.screenshot.file);
      } else {
        body.set(`${p}description`, it.description);
        it.images.forEach((img) => body.append(`${p}images`, img.file));
      }
    });

    setSubmitting(true);
    try {
      const res = await fetch('/api/orders', { method: 'POST', body });
      const json = (await res.json().catch(() => ({}))) as { id?: string; number?: string; error?: string; item?: number };
      if (!res.ok || !json.id || !json.number) {
        const map: Record<string, string> = {
          file_type: o.fileType,
          file_size: o.fileSize,
          too_many: o.tooMany,
          no_image: o.needImage,
          rate: m.auth.rate,
          invalid: m.common.invalid,
          region_coming_soon: m.soon.blocked,
          mixed_regions: c.mixedServer,
          too_many_items: c.tooManyItems,
        };
        const message = map[json.error ?? ''] ?? m.common.error;
        setServerError(typeof json.item === 'number' ? `${fmt(c.fixItem, { n: json.item + 1 })} ${message}` : message);
        if (typeof json.item === 'number') setOpen(json.item);
        return;
      }
      latest.current.forEach((i) => {
        i.images.forEach((p) => URL.revokeObjectURL(p.preview));
        if (i.card.screenshot) URL.revokeObjectURL(i.card.screenshot.preview);
      });
      setItems([blankItem('URL')]);
      setOpen(0);
      setInstructions('');
      setShowErrors(false);
      setDone({ id: json.id, number: json.number });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setServerError(m.common.error);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Card className="p-8 text-center sm:p-12">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-on-accent">
          <Check className="size-6" aria-hidden />
        </div>
        <h2 className="mt-6 text-2xl font-semibold">{o.successTitle}</h2>
        <p className="mx-auto mt-3 max-w-md leading-relaxed text-ink-soft">{fmt(o.successText, { number: done.number })}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href={`/dashboard/orders/${done.id}`} className={buttonClass('primary', 'lg')}>
            {o.viewOrder}
          </Link>
          <Button variant="secondary" size="lg" onClick={() => setDone(null)}>
            {o.another}
          </Button>
        </div>
      </Card>
    );
  }

  const regionChoice = !detectedRegionKeys.some(Boolean);

  return (
    <div className="space-y-4">
      {/* ── order region ── */}
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="text-sm font-semibold">{orderRegion ? fmt(c.region, { region: orderRegion.name }) : o.region}</p>
          <p className="mt-1 max-w-md text-[12px] leading-relaxed text-muted">{c.regionWhy}</p>
        </div>
        {regionChoice && (
          <Select aria-label={o.region} value={regionKey} onChange={(e) => setRegionKey(e.target.value)} className="sm:w-56">
            <option value="">{o.regionUnknown}</option>
            {regions.map((r) => (
              <option key={r.key} value={r.key} disabled={r.soon}>
                {r.soon ? fmt(o.regionSoonOption, { region: r.name }) : r.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      {soon && <ComingSoonNote text={fmt(m.soon.text, { region: soon.name })} badge={m.soon.badge} />}

      {/* ── items ── */}
      <ol className="space-y-3">
        {items.map((it, index) => {
          const isOpen = open === index;
          const list = problems(it, index);
          const label = it.mode === 'URL' ? it.title || (detected[index]?.name ?? (parseHttpUrl(it.url) ? new URL(it.url.trim()).hostname.replace(/^www\./, '') : c.empty)) : it.description || c.empty;
          return (
            <li key={it.key}>
              <Card className={cn('overflow-hidden transition-colors', showErrors && list.length > 0 && 'border-danger/50')}>
                <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                  <span className="tabular flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-on-accent">{index + 1}</span>
                  <button type="button" onClick={() => setOpen(isOpen ? -1 : index)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left" aria-expanded={isOpen}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] font-medium tracking-[0.14em] text-muted uppercase">{fmt(c.item, { n: index + 1 })}{detected[index] ? ` · ${detected[index]!.name}` : ''}</span>
                      <span className={cn('block truncate text-sm font-medium', !it.title && !it.description && 'text-muted')}>{label}</span>
                    </span>
                    {showErrors && list.length > 0 && <AlertCircle className="size-4 shrink-0 text-danger" aria-hidden />}
                    <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform duration-300', isOpen && 'rotate-180')} aria-hidden />
                  </button>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(index)} aria-label={c.remove} className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-danger-soft hover:text-danger">
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden">
                      <ItemEditor
                        item={it}
                        index={index}
                        problems={showErrors ? list : []}
                        storeName={detected[index]?.name ?? (parseHttpUrl(it.url) ? new URL(it.url.trim()).hostname.replace(/^www\./, '') : '')}
                        regionKey={orderRegion && !orderRegion.soon ? orderRegion.key : null}
                        pricing={pricing}
                        currency={currencyFor(it)}
                        onChange={(patch) => update(index, patch)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </li>
          );
        })}
      </ol>

      {/* ── add another item ── */}
      {items.length < MAX_ITEMS && (
        <div className="rounded-card border border-dashed border-accent/40 bg-accent-soft/30 p-4 sm:p-5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Plus className="size-4 text-accent" aria-hidden />
            {c.add}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{c.addHint}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => addItem('URL')}>
              <Link2 className="size-4" aria-hidden />
              {o.tabUrl}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => addItem('IMAGE')}>
              <Camera className="size-4" aria-hidden />
              {o.tabImage}
            </Button>
          </div>
        </div>
      )}

      {/* ── basket: total and what combining saves ── */}
      <Card className="p-5 sm:p-6" aria-live="polite">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">{c.summary}</h2>
          <span className="text-[13px] text-muted">{fmt(c.items, { n: items.length })}</span>
        </div>
        {basket && basket.priced > 0 && 'together' in basket ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-ink-soft">{c.together}</span>
              <span className="tabular font-display text-2xl font-semibold tracking-tight">≈ {formatAzn(basket.together, locale)}</span>
            </div>
            {basket.savings > 0 && (
              <>
                <div className="flex items-baseline justify-between gap-3 text-sm text-muted">
                  <span>{c.separately}</span>
                  <span className="tabular line-through">≈ {formatAzn(basket.separately, locale)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-control bg-accent px-4 py-3 text-on-accent">
                  <span className="text-sm font-semibold">{c.savings}</span>
                  <span className="tabular font-display text-xl font-semibold">≈ {formatAzn(basket.savings, locale)}</span>
                </div>
              </>
            )}
            <p className="text-[12px] leading-relaxed text-ink-soft">{items.length > 1 ? c.why : c.nudge}</p>
            <p className="text-[11px] leading-relaxed text-muted">{c.estimateNote}</p>
          </div>
        ) : (
          <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">{orderRegion && !orderRegion.soon ? c.noPrices : o.card.estimateRegion}</p>
        )}
      </Card>

      <Field label={o.instructions} optional={m.common.optional}>
        <Textarea placeholder={o.instructionsPh} value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={2000} />
      </Field>

      {serverError && (
        <p role="alert" className="rounded-control bg-danger-soft px-3.5 py-3 text-sm text-danger">
          {serverError}
        </p>
      )}

      <div className="flex flex-col-reverse items-stretch gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-center text-[13px] text-muted sm:text-left">{o.free}</p>
        <Button type="button" size="lg" variant="accent" disabled={submitting || !!soon || anyMismatch} onClick={submit}>
          {submitting && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
          {submitting ? o.submitting : items.length > 1 ? `${c.submit} · ${fmt(c.items, { n: items.length })}` : c.submit}
        </Button>
      </div>
    </div>
  );
}

/** Editing one item: link or photo, then size/colour and quantity. */
function ItemEditor({
  item,
  index,
  problems,
  storeName,
  regionKey,
  pricing,
  currency,
  onChange,
}: {
  item: Item;
  index: number;
  problems: string[];
  storeName: string;
  regionKey: string | null;
  pricing: Pricing;
  currency: string;
  onChange: (patch: Partial<Item>) => void;
}) {
  const { m } = useI18n();
  const o = m.order;
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const validUrl = parseHttpUrl(item.url) !== null;

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    setFileError(null);
    const next = [...item.images];
    for (const file of Array.from(list)) {
      if (!ACCEPT.includes(file.type)) {
        setFileError(o.fileType);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setFileError(o.fileSize);
        continue;
      }
      if (next.length >= MAX_FILES) {
        setFileError(o.tooMany);
        break;
      }
      next.push({ file, preview: URL.createObjectURL(file) });
    }
    onChange({ images: next });
  }

  const card = (
    <RequestCard
      variant={item.mode === 'URL' ? 'link' : 'photo'}
      storeName={storeName}
      regionKey={regionKey}
      quantity={Number(item.quantity) || 1}
      pricing={pricing}
      value={{ ...item.card, currency }}
      showEstimate={false}
      onChange={(next) => onChange({ card: next, currencyTouched: item.currencyTouched || next.currency !== currency })}
      onChangeLink={() => {
        onChange({ url: '' });
        urlRef.current?.focus();
      }}
    />
  );

  return (
    <div className="space-y-5 border-t border-line p-4 sm:p-5">
      <div role="tablist" className="grid grid-cols-2 rounded-[1rem] bg-paper/60 p-1">
        {(['URL', 'IMAGE'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={item.mode === mode}
            onClick={() => onChange({ mode })}
            className={cn('flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[0.8rem] text-sm font-medium transition-colors', item.mode === mode ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink')}
          >
            {mode === 'URL' ? <Link2 className="size-4" aria-hidden /> : <Camera className="size-4" aria-hidden />}
            {mode === 'URL' ? o.tabUrl : o.tabImage}
          </button>
        ))}
      </div>

      {item.mode === 'URL' ? (
        <>
          <Field label={o.url}>
            <Input ref={urlRef} type="url" inputMode="url" placeholder={o.card.hint} autoComplete="off" value={item.url} onChange={(e) => onChange({ url: e.target.value })} autoFocus={index > 0 && !item.url} />
          </Field>
          <AnimatePresence initial={false}>{validUrl && <motion.div key="card">{card}</motion.div>}</AnimatePresence>
          <Field label={o.productTitle}>
            <Input placeholder={o.productTitlePh} value={item.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={300} />
          </Field>
          <Field label={o.variant} optional={m.common.optional}>
            <Input placeholder={o.variantPh} value={item.variant} onChange={(e) => onChange({ variant: e.target.value })} maxLength={200} />
          </Field>
        </>
      ) : (
        <>
          <div className="flex gap-3.5 rounded-control border border-accent/30 bg-accent-soft/60 px-4 py-3.5">
            <ScanSearch className="mt-0.5 size-5 shrink-0 text-accent" strokeWidth={1.75} aria-hidden />
            <div>
              <p className="text-sm font-semibold">{o.photoIntroTitle}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{o.photoIntro}</p>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink-soft">{o.images}</p>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                addFiles(e.dataTransfer.files);
              }}
              className={cn('rounded-card border border-dashed px-5 py-7 text-center transition-colors', dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-paper/50')}
            >
              <ImagePlus className="mx-auto size-6 text-muted" strokeWidth={1.5} aria-hidden />
              <p className="mt-3 text-sm font-medium">{o.drop}</p>
              <p className="mt-1 text-[13px] text-muted">{o.dropHint}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => galleryRef.current?.click()}>
                  <ImagePlus className="size-4" aria-hidden />
                  {o.images}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => cameraRef.current?.click()}>
                  <Camera className="size-4" aria-hidden />
                  {o.camera}
                </Button>
              </div>
              <input ref={galleryRef} type="file" accept={ACCEPT.join(',')} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            </div>
            {fileError && <p className="mt-2 text-[13px] text-danger">{fileError}</p>}
            {item.images.length > 0 && (
              <ul className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-6">
                {item.images.map((img, i) => (
                  <li key={img.preview} className="relative aspect-square overflow-hidden rounded-control border border-line bg-paper">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.preview} alt="" className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        URL.revokeObjectURL(img.preview);
                        onChange({ images: item.images.filter((_, j) => j !== i) });
                      }}
                      aria-label={m.common.remove}
                      className="absolute top-1 right-1 flex size-6 cursor-pointer items-center justify-center rounded-full bg-black/70 text-ink"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Field label={o.description}>
            <Textarea placeholder={o.descriptionPh} value={item.description} onChange={(e) => onChange({ description: e.target.value })} maxLength={2000} />
          </Field>
          {card}
        </>
      )}

      <div className="grid grid-cols-[1fr_7rem] gap-4">
        <Field label={o.sizeColor} optional={m.common.optional}>
          <Input placeholder={o.sizeColorPh} value={item.sizeColor} onChange={(e) => onChange({ sizeColor: e.target.value })} maxLength={200} />
        </Field>
        <Field label={o.quantity}>
          <Input type="number" inputMode="numeric" min={1} max={10000} value={item.quantity} onChange={(e) => onChange({ quantity: e.target.value })} />
        </Field>
      </div>

      {problems.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-control bg-danger-soft px-3.5 py-3 text-[13px] text-danger">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ComingSoonNote({ text, badge }: { text: string; badge: string }) {
  return (
    <div role="status" className="flex gap-3 rounded-control border border-dashed border-line-strong bg-paper px-4 py-3.5">
      <Clock className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
      <div>
        <span className="text-[11px] font-semibold tracking-[0.16em] text-accent uppercase">{badge}</span>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{text}</p>
      </div>
    </div>
  );
}
