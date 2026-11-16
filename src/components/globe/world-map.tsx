'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Clock } from 'lucide-react';
import { useI18n } from '@/i18n/client';
import { cn, fmt, formatAzn } from '@/lib/format';
import { buttonClass } from '@/components/ui';
import { BAKU_GEO, REGION_GEO } from './geo';
import { decodeLand, FLAT_LAND } from './land-data';

export type MapRegion = {
  key: string;
  name: string;
  /** Announced, not open for orders: dashed route, no aircraft, no rates. */
  soon: boolean;
  currency: string;
  commissionPercent: number;
  cargoPerKgUsd: number;
  stores: string[];
  otherStores: string;
};
type Labels = { baku: string; select: string; currency: string; commission: string; cargo: string; cargoValue: string; order: string; pricing: string; schematic: string };

// Equirectangular window: longitudes −140…160, latitudes 82…−58.
const VIEW = { x: 40, w: 300, h: 140 };
const project = (lat: number, lon: number) => ({ x: lon + 180 - VIEW.x, y: 82 - lat });
const HUB = project(BAKU_GEO[0], BAKU_GEO[1]);
const PLANE = 'M3 0 L-1-.5-2.2-2.6-3-2.6-2.2-.45-3.6-.3-4.2-1.2-4.7-1.2-4.3 0-4.7 1.2-4.2 1.2-3.6.3-2.2.45-3 2.6-2.2 2.6-1 .5Z';

function routePath(key: string) {
  const p = project(REGION_GEO[key][0], REGION_GEO[key][1]);
  const distance = Math.hypot(p.x - HUB.x, p.y - HUB.y);
  const cx = (p.x + HUB.x) / 2;
  const cy = Math.max(3, (p.y + HUB.y) / 2 - distance * 0.28 - 6);
  // Rounded so server and browser print identical numbers (float formatting differs between engines).
  const r = (n: number) => Math.round(n * 100) / 100;
  return { p, d: `M ${r(p.x)} ${r(p.y)} Q ${r(cx)} ${r(cy)} ${r(HUB.x)} ${r(HUB.y)}` };
}

/** The detailed, flat companion to the hero globe: every region visible at once, explorable. Decorative aircraft only. */
export function WorldMap({ regions, labels, soon, usdRate }: { regions: MapRegion[]; labels: Labels; soon: { badge: string; title: string; text: string }; usdRate?: number }) {
  const { locale } = useI18n();
  const mapped = regions.filter((r) => REGION_GEO[r.key]);
  const [selectedKey, setSelectedKey] = useState(regions[0]?.key ?? '');
  const selected = regions.find((r) => r.key === selectedKey) ?? regions[0];
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  // Continents as a dot matrix; dots around the selected region are lit.
  useEffect(() => {
    const el = frame.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const land = decodeLand(FLAT_LAND);
    const focus = selected && !selected.soon && REGION_GEO[selected.key] ? project(REGION_GEO[selected.key][0], REGION_GEO[selected.key][1]) : null;
    const draw = () => {
      const { width, height } = el.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(width * ratio);
      cv.height = Math.round(height * ratio);
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      const unit = cv.width / VIEW.w;
      const radius = Math.max(0.7 * ratio, unit * 0.62);
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (let i = 0; i < land.length; i += 2) {
        const p = project(land[i] / 100, land[i + 1] / 100);
        if (p.x < 0 || p.x > VIEW.w) continue;
        const near = focus ? Math.max(0, 1 - Math.hypot(p.x - focus.x, p.y - focus.y) / 26) : 0;
        const home = Math.max(0, 1 - Math.hypot(p.x - HUB.x, p.y - HUB.y) / 9);
        const glow = Math.max(near, home);
        ctx.fillStyle = glow > 0 ? `rgba(${Math.round(72 + 183 * glow)}, ${Math.round(72 + 60 * glow)}, ${Math.round(68 + 10 * glow)}, 1)` : '#3a3a36';
        ctx.beginPath();
        ctx.arc(p.x * unit, p.y * unit, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(el);
    return () => observer.disconnect();
  }, [selected]);

  if (!selected) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_0.7fr] lg:items-stretch">
      <div>
        <div ref={frame} className="relative overflow-hidden rounded-card border border-line bg-surface" style={{ aspectRatio: `${VIEW.w} / ${VIEW.h}` }}>
          <canvas ref={canvas} className="absolute inset-0 size-full" aria-hidden />
          <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className="absolute inset-0 size-full" aria-hidden>
            {mapped.map((r, i) => {
              const { d } = routePath(r.key);
              const active = r.key === selected.key;
              return (
                <g key={r.key}>
                  <path
                    d={d}
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                    strokeWidth={active ? 1.75 : 1}
                    strokeDasharray={r.soon ? '2 6' : undefined}
                    className={cn(r.soon ? 'transition-[stroke] duration-500' : 'route-flow transition-[stroke] duration-500', r.soon ? (active ? 'stroke-white/45' : 'stroke-white/15') : active ? 'stroke-accent' : 'stroke-white/25')}
                  />
                  {!r.soon && (
                  <path d={PLANE} className={cn('transition-[fill] duration-500', active ? 'fill-ink' : 'fill-ink/55')} transform="scale(0.9)">
                    <animateMotion dur={`${7 + i * 1.6}s`} begin={`${-i * 2.1}s`} repeatCount="indefinite" rotate="auto" path={d} />
                  </path>
                  )}
                </g>
              );
            })}
            <circle cx={HUB.x} cy={HUB.y} r="5" className="route-ping fill-accent/50" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />
            <circle cx={HUB.x} cy={HUB.y} r="2.2" className="fill-accent" />
            <circle cx={HUB.x} cy={HUB.y} r="0.9" fill="#fff" />
          </svg>

          <span
            className="pointer-events-none absolute translate-y-2.5 -translate-x-1/2 font-display text-[10px] font-semibold tracking-[0.18em] whitespace-nowrap uppercase sm:text-[12px]"
            style={{ left: `${(HUB.x / VIEW.w) * 100}%`, top: `${(HUB.y / VIEW.h) * 100}%` }}
          >
            {labels.baku}
          </span>
          {mapped.map((r) => {
            const { p } = routePath(r.key);
            const active = r.key === selected.key;
            return (
              <button
                key={r.key}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedKey(r.key)}
                onMouseEnter={() => setSelectedKey(r.key)}
                onFocus={() => setSelectedKey(r.key)}
                style={{ left: `${(p.x / VIEW.w) * 100}%`, top: `${(p.y / VIEW.h) * 100}%` }}
                className={cn(
                  'absolute flex h-7 -translate-x-1/2 -translate-y-[130%] cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-medium tracking-[0.12em] whitespace-nowrap uppercase transition-colors duration-300 sm:h-8 sm:px-3 sm:text-[11px]',
                  r.soon
                    ? active
                      ? 'border-dashed border-white/50 bg-black/70 text-ink'
                      : 'border-dashed border-white/20 bg-black/60 text-muted hover:border-white/50'
                    : active
                      ? 'border-accent bg-accent text-on-accent'
                      : 'border-white/15 bg-black/60 text-ink-soft hover:border-accent',
                )}
              >
                {r.name}
                {r.soon && <span className="hidden text-[8px] tracking-[0.18em] text-accent sm:inline">{soon.badge}</span>}
              </button>
            );
          })}
          {mapped.map((r) => {
            const { p } = routePath(r.key);
            return (
              <span
                key={r.key}
                className={cn('pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors duration-300', r.soon ? 'border-muted bg-paper' : r.key === selected.key ? 'border-accent bg-accent' : 'border-accent bg-paper')}
                style={{ left: `${(p.x / VIEW.w) * 100}%`, top: `${(p.y / VIEW.h) * 100}%` }}
                aria-hidden
              />
            );
          })}
        </div>
        <p className="mt-3 text-[12px] text-muted">{labels.schematic}</p>
      </div>

      <div className="flex flex-col rounded-card border border-line bg-surface p-6 sm:p-7" aria-live="polite">
        <div role="group" aria-label={labels.select} className="flex flex-wrap gap-1.5">
          {regions.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={r.key === selected.key}
              onClick={() => setSelectedKey(r.key)}
              className={cn(
                'h-8 cursor-pointer rounded-full px-3 text-[12px] font-medium tracking-[0.1em] uppercase transition-colors',
                r.key === selected.key ? 'bg-accent-soft text-accent' : r.soon ? 'text-muted/60 hover:text-muted' : 'text-muted hover:text-ink',
              )}
            >
              {r.name}
              {r.soon && <span className="ml-1 text-[8px] text-accent/80">●</span>}
            </button>
          ))}
        </div>

        <h3 className="display mt-6 flex flex-wrap items-center gap-x-3 text-3xl sm:text-4xl">
          {selected.name} <ArrowRight className="size-6 text-accent" aria-hidden /> {labels.baku}
        </h3>
        {selected.soon ? (
          <div className="mt-6 flex flex-1 flex-col">
            <span className="inline-flex h-7 w-fit items-center gap-1.5 rounded-full border border-dashed border-accent/60 px-3 text-[11px] font-semibold tracking-[0.18em] text-accent uppercase">
              <Clock className="size-3" aria-hidden />
              {soon.badge}
            </span>
            {selected.otherStores && <p className="mt-4 text-sm leading-relaxed text-muted">{selected.otherStores}</p>}
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">{fmt(soon.text, { region: selected.name })}</p>
          </div>
        ) : (
          <>
        {selected.stores.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-1">
            {selected.stores.map((s) => (
              <li key={s} className="font-display text-lg font-semibold tracking-tight">
                {s}
              </li>
            ))}
          </ul>
        )}
        {selected.otherStores && <p className="mt-2 text-sm leading-relaxed text-ink-soft">{selected.otherStores}</p>}

        <dl className="tabular mt-6 divide-y divide-line border-y border-line text-sm">
          {[
            [labels.currency, selected.currency],
            [labels.commission, `${selected.commissionPercent}%`],
            [labels.cargo, `${fmt(labels.cargoValue, { usd: selected.cargoPerKgUsd.toFixed(2) })}${usdRate ? ` ≈ ${formatAzn(selected.cargoPerKgUsd * usdRate, locale)}` : ''}`],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-auto flex flex-col gap-2 pt-6">
          <Link href={`/order?region=${selected.key}`} className={buttonClass('accent', 'md', 'w-full')}>
            {fmt(labels.order, { region: selected.name })}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <Link href={`/pricing?region=${selected.key}`} className="py-1.5 text-center text-sm text-ink-soft underline underline-offset-4 hover:text-ink">
            {fmt(labels.pricing, { region: selected.name })}
          </Link>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
