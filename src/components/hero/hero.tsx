'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { animate, motion, useMotionValue, useMotionValueEvent, useTransform, type AnimationPlaybackControls, type MotionValue } from 'motion/react';
import { ArrowDown, ArrowRight, ArrowUpRight, Clock } from 'lucide-react';
import { ButtonLink, Container, Eyebrow } from '@/components/ui';
import { cn, fmt } from '@/lib/format';
import { Bag, Headphones, Phone, Sneaker } from './art';
import { ParcelBox } from './box';

// WebGL is the expensive part: its chunk (three.js + the scene) loads after the text has painted.
const Globe = dynamic(() => import('@/components/globe/globe').then((mod) => mod.Globe), { ssr: false });

const SCENE_STARTS = [0, 0.19, 0.45, 0.7, 0.9, 1];
/** The resting frame of each of the five scenes on the 0 → 1 timeline. One scroll step moves to the next. */
const SCENE_FRAMES = [0, 0.37, 0.6, 0.89, 1];
const LAST = SCENE_FRAMES.length - 1;
const STEP_EASE = [0.65, 0, 0.35, 1] as const;
const STEP_SECONDS = 1.05;
/** Input during a transition is swallowed, so one gesture can never skip a scene. */
const LOCK_MS = 800;
/** A pause this long between wheel events starts a new gesture. */
const GESTURE_GAP_MS = 170;

export type HeroText = {
  eyebrow: string;
  headline: string[];
  lead: string;
  cta: string;
  cta2: string;
  scroll: string;
  scenes: { title: string; text: string }[];
  disclaimer: string;
  explore: string;
};
export type SoonText = { badge: string; title: string; text: string };
export type HeroRegion = { key: string; name: string; stores: string[]; other: string; soon: boolean };

const rise = (delay: number): CSSProperties => ({ '--rise-delay': `${delay}s` }) as CSSProperties;

/** A block of copy that belongs to one scene: fades in, holds, fades out with the scroll. */
function SceneLayer({ progress, range, className, children }: { progress: MotionValue<number>; range: [number, number, number, number]; className?: string; children: ReactNode }) {
  const opacity = useTransform(progress, range, [0, 1, 1, 0]);
  const y = useTransform(progress, range, [36, 0, 0, -36]);
  const visibility = useTransform(opacity, (v) => (v < 0.01 ? 'hidden' : 'visible'));
  return (
    <motion.div className={cn('pointer-events-none absolute inset-0', className)} style={{ opacity, y, visibility }}>
      {children}
    </motion.div>
  );
}

function SceneHeading({ index, title, text, className }: { index: number; title: string; text: string; className?: string }) {
  return (
    <div className={className}>
      <p className="tabular text-[12px] font-medium tracking-[0.2em] text-accent uppercase">0{index + 1}</p>
      <h2 className="display mt-4 text-[clamp(2.4rem,6vw,5.5rem)]">{title}</h2>
      <p className="mt-5 max-w-sm text-base leading-relaxed text-ink-soft sm:text-lg">{text}</p>
    </div>
  );
}

function StoreName({ progress, index, total, latin, children }: { progress: MotionValue<number>; index: number; total: number; latin: boolean; children: ReactNode }) {
  const start = 0.21 + (index / total) * 0.12;
  const opacity = useTransform(progress, [start, start + 0.035], [0, 1]);
  const x = useTransform(progress, [start, start + 0.05], [-28, 0]);
  return (
    <motion.li lang={latin ? 'en' : undefined} className="display text-[clamp(1.7rem,4.6vw,4.25rem)] text-ink-soft" style={{ opacity, x }}>
      {children}
    </motion.li>
  );
}

const TILES = [
  { Art: Sneaker, className: 'right-[30%] top-[16%] size-28 sm:size-36 lg:size-44', pad: 'p-5 lg:p-7', drift: 90 },
  { Art: Phone, className: 'right-[8%] top-[30%] size-20 sm:size-24 lg:size-28', pad: 'p-3', drift: 150 },
  { Art: Bag, className: 'right-[36%] bottom-[20%] hidden size-24 sm:block lg:size-28', pad: 'p-4', drift: 60 },
  { Art: Headphones, className: 'right-[10%] bottom-[26%] size-20 sm:size-24 lg:size-28', pad: 'p-4', drift: 120 },
];

function ProductTile({ progress, index }: { progress: MotionValue<number>; index: number }) {
  const t = TILES[index];
  const start = 0.215 + index * 0.02;
  const opacity = useTransform(progress, [start, start + 0.04, 0.41, 0.45], [0, 1, 1, 0]);
  const y = useTransform(progress, [0.2, 0.45], [t.drift, -t.drift]);
  const scale = useTransform(progress, [start, start + 0.06], [0.8, 1]);
  return (
    <motion.div className={cn('absolute', t.className)} style={{ opacity, y, scale }} aria-hidden>
      <div
        className={cn('hero-float size-full rounded-[24%] border border-white/10 bg-raised/90 shadow-float backdrop-blur-sm', t.pad)}
        style={{ '--float-duration': `${5.5 + index * 0.8}s`, '--float-delay': `${-index * 1.2}s`, '--float-distance': '-9px' } as CSSProperties}
      >
        <t.Art className="size-full" />
      </div>
    </motion.div>
  );
}

function Segment({ progress, index, label, onSelect }: { progress: MotionValue<number>; index: number; label: string; onSelect: () => void }) {
  const scaleX = useTransform(progress, [SCENE_STARTS[index], SCENE_STARTS[index + 1]], [0, 1]);
  return (
    <button type="button" onClick={onSelect} aria-label={`0${index + 1} ${label}`} className="group flex h-5 flex-1 cursor-pointer items-center">
      <span className="relative h-px w-full overflow-hidden bg-line-strong transition-[height] duration-300 group-hover:h-0.5">
        <motion.span className="absolute inset-0 origin-left bg-accent" style={{ scaleX }} />
      </span>
    </button>
  );
}

export function Hero({
  text,
  regions,
  storeNames,
  baku,
  brand,
  statement,
  orderLabel,
  soon,
}: {
  text: HeroText;
  regions: HeroRegion[];
  /** `latin` marks brand names, which must not be upper-cased with Azerbaijani rules (i → İ). */
  storeNames: { name: string; latin: boolean }[];
  baku: string;
  brand: string;
  statement: string;
  orderLabel: string;
  soon: SoonText;
}) {
  const section = useRef<HTMLElement>(null);
  const progress = useMotionValue(0);
  const [still, setStill] = useState(false);
  const [lite, setLite] = useState(false);
  const [scene, setScene] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const small = window.matchMedia('(max-width: 1023px), (pointer: coarse)');
    const update = () => {
      setStill(reduced.matches);
      setLite(small.matches);
    };
    update();
    reduced.addEventListener('change', update);
    small.addEventListener('change', update);
    return () => {
      reduced.removeEventListener('change', update);
      small.removeEventListener('change', update);
    };
  }, []);

  // ── Five scenes, five steps ────────────────────────────────────────────────────────────────────
  // The hero is one screen tall. While the page is at the very top, one small wheel tick, trackpad swipe,
  // touch swipe or arrow / PageDown key moves exactly one scene. After the fifth scene the same input
  // scrolls the page normally; scrolling back to the top walks the scenes back one by one.
  const step = useRef(0);
  const lockedUntil = useRef(0);
  const running = useRef<AnimationPlaybackControls | null>(null);

  const goTo = useCallback(
    (next: number, instant = false) => {
      const target = Math.max(0, Math.min(LAST, next));
      if (target === step.current && !instant) return;
      step.current = target;
      running.current?.stop();
      if (instant) {
        progress.set(SCENE_FRAMES[target]);
        return;
      }
      lockedUntil.current = performance.now() + LOCK_MS;
      running.current = animate(progress, SCENE_FRAMES[target], { duration: STEP_SECONDS, ease: STEP_EASE });
    },
    [progress],
  );

  useEffect(() => {
    if (still) {
      running.current?.stop();
      step.current = 0;
      progress.set(0);
      return;
    }
    // Arriving mid-page (reload, back button, anchor): show the finished hero.
    if (window.scrollY > 4) goTo(LAST, true);

    const atTop = () => window.scrollY <= 2;
    /** Should this input move a scene (and therefore not scroll the page)? */
    const claims = (forward: boolean) => atTop() && (forward ? step.current < LAST : step.current > 0);

    let lastWheel = 0;
    let lastAbs = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return; // pinch-zoom, horizontal swipe
      const now = performance.now();
      const gap = now - lastWheel;
      const abs = Math.abs(e.deltaY);
      const prevAbs = lastAbs;
      lastWheel = now;
      lastAbs = abs;
      const forward = e.deltaY > 0;
      if (!claims(forward)) return;
      e.preventDefault();
      if (now < lockedUntil.current) return;
      // A new gesture, or a mouse wheel that keeps ticking. A decaying trackpad inertia tail is neither.
      if (gap > GESTURE_GAP_MS || (abs >= 40 && abs >= prevAbs)) goTo(step.current + (forward ? 1 : -1));
    };

    let touchY: number | null = null;
    let touchFired = false;
    let touchAtTop = false;
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches.length === 1 ? e.touches[0].clientY : null;
      touchFired = false;
      touchAtTop = atTop();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchY === null || !touchAtTop || e.touches.length !== 1) return;
      const dy = touchY - e.touches[0].clientY; // > 0: finger moves up = forward
      if (Math.abs(dy) < 6) return;
      const forward = dy > 0;
      if (!claims(forward)) return;
      if (e.cancelable) e.preventDefault();
      if (!touchFired && Math.abs(dy) > 34 && performance.now() >= lockedUntil.current) {
        touchFired = true;
        goTo(step.current + (forward ? 1 : -1));
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.altKey || e.ctrlKey || e.metaKey || el?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const forward = e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey);
      const back = e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey);
      if (!forward && !back) return;
      if (!claims(forward)) return;
      e.preventDefault();
      if (performance.now() >= lockedUntil.current) goTo(step.current + (forward ? 1 : -1));
    };

    // Scrollbar drags and anchor jumps skip the steps; never leave the hero half-told.
    const onScroll = () => {
      if (window.scrollY > 40 && step.current < LAST) goTo(LAST);
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
      running.current?.stop();
    };
  }, [still, progress, goTo]);

  useMotionValueEvent(progress, 'change', (v) => {
    let next = 0;
    for (let i = 1; i < 5; i++) if (v >= SCENE_STARTS[i]) next = i;
    setScene((current) => (current === next ? current : next));
  });

  const hint = useTransform(progress, [0, 0.05], [1, 0]);
  const railOpacity = useTransform(progress, [0.6, 0.68], [1, 0]);
  const railEvents = useTransform(progress, (v) => (v < 0.64 ? 'auto' : 'none'));
  const scrim = useTransform(progress, [0.6, 0.72], [1, 0]);
  const bar = useTransform(progress, [0, 1], [0, 1]);
  const current = regions.find((r) => r.key === selected) ?? null;
  const globeRegions = regions.map((r) => ({ key: r.key, name: r.name, soon: r.soon }));
  const lastLine = text.headline.length - 1;

  return (
    <section ref={section} className="relative h-[calc(100svh-4rem)] min-h-[34rem]">
      <div className="relative h-full overflow-hidden">
        {/* ── the world ── */}
        <div className="absolute inset-0">
          <Globe regions={globeRegions} soonLabel={soon.badge} baku={baku} selected={selected} onSelect={setSelected} progress={progress} lite={lite} still={still} />
        </div>
        <motion.div
          className="pointer-events-none absolute inset-0 bg-linear-to-b from-paper via-paper/55 to-transparent to-55% lg:bg-[linear-gradient(90deg,var(--color-paper)_0%,rgb(6_6_6/0.78)_26%,transparent_56%)]"
          style={{ opacity: scrim }}
          aria-hidden
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-paper to-transparent" aria-hidden />
        <motion.span className="absolute inset-x-0 top-0 h-px origin-left bg-accent lg:hidden" style={{ scaleX: bar }} aria-hidden />

        {/* ── scene 1: headline ── */}
        <SceneLayer progress={progress} range={[-1, -0.5, 0.12, 0.185]}>
          <Container className="flex h-full flex-col justify-start pt-9 sm:pt-14 lg:justify-center lg:pt-0 lg:pb-24">
            <div className="max-w-3xl">
              <div className="hero-rise" style={rise(0)}>
                <Eyebrow>{text.eyebrow}</Eyebrow>
              </div>
              <h1 className="display mt-5 text-[clamp(2.35rem,5.7vw,5.5rem)]">
                {text.headline.map((line, i) => (
                  <span key={line} className={cn('hero-rise block', i === lastLine && 'text-ink-soft')} style={rise(0.08 + i * 0.1)}>
                    {i === lastLine && line.endsWith('.') ? (
                      <>
                        {line.slice(0, -1)}
                        <span className="text-accent">.</span>
                      </>
                    ) : (
                      line
                    )}
                  </span>
                ))}
              </h1>
              <p className="hero-rise mt-6 max-w-md text-base leading-relaxed text-ink-soft sm:text-lg" style={rise(0.32)}>
                {text.lead}
              </p>
              <div className="hero-rise pointer-events-auto mt-8 flex flex-wrap items-center gap-x-1 gap-y-2 sm:gap-3" style={rise(0.42)}>
                <ButtonLink href="/order" variant="accent" size="lg" className="group transition-[background-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_50px_-14px_rgb(255_90_31/0.7)]">
                  {text.cta}
                  <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
                </ButtonLink>
                <ButtonLink href="/how-it-works" variant="ghost" size="lg" className="group px-5 sm:px-7">
                  {text.cta2}
                  <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
                </ButtonLink>
              </div>
            </div>
          </Container>
        </SceneLayer>

        {/* ── scene 2: marketplaces and products ── */}
        <SceneLayer progress={progress} range={[0.19, 0.22, 0.4, 0.45]}>
          {TILES.map((_, i) => (
            <ProductTile key={i} progress={progress} index={i} />
          ))}
          <Container className="flex h-full flex-col justify-start pt-9 sm:pt-14 lg:justify-center lg:pt-0 lg:pb-20">
            <p className="tabular text-[12px] font-medium tracking-[0.2em] text-accent uppercase">02 — {text.scenes[1].title}</p>
            <ul className="mt-5 space-y-1">
              {storeNames.map((store, i) => (
                <StoreName key={store.name} progress={progress} index={i} total={storeNames.length} latin={store.latin}>
                  {store.name}
                </StoreName>
              ))}
            </ul>
          </Container>
        </SceneLayer>

        {/* ── scene 3: the journey ── */}
        <SceneLayer progress={progress} range={[0.45, 0.49, 0.64, 0.69]}>
          <Container className="flex h-full flex-col justify-start pt-9 sm:pt-14 lg:justify-center lg:pt-0 lg:pb-20">
            <SceneHeading index={2} title={text.scenes[2].title} text={text.scenes[2].text} />
            <p className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium tracking-[0.16em] text-muted uppercase">
              {regions.map((r) => (
                <span key={r.key}>{r.name}</span>
              ))}
              <ArrowRight className="size-3.5 text-accent" aria-hidden />
              <span className="text-ink">{baku}</span>
            </p>
          </Container>
        </SceneLayer>

        {/* ── scene 4: arrival and unboxing ── */}
        <SceneLayer progress={progress} range={[0.7, 0.73, 0.9, 0.93]}>
          <Container className="flex h-full flex-col justify-start pt-9 sm:pt-14 lg:justify-center lg:pt-0 lg:pb-20">
            <SceneHeading index={3} title={text.scenes[3].title} text={text.scenes[3].text} />
          </Container>
        </SceneLayer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center pt-[26svh] lg:justify-end lg:pt-[10svh] lg:pr-[22%]">
          <div className="scale-75 sm:scale-90 lg:scale-110">
            <ParcelBox progress={progress} from={0.7} to={0.93} brand={brand} />
          </div>
        </div>

        {/* ── scene 5: hand-over to the rest of the page ── */}
        <SceneLayer progress={progress} range={[0.925, 0.97, 2, 3]}>
          <Container className="flex h-full flex-col items-center justify-center pb-[18svh] text-center">
            <p className="font-display text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              {brand}
              <span className="text-accent">.</span>
            </p>
            <p className="display mt-6 max-w-5xl text-[clamp(2rem,5.6vw,5rem)]">{statement}</p>
          </Container>
        </SceneLayer>

        {/* ── bottom bar: scene indicator, region explorer, disclaimer ── */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0">
          <Container className="flex items-end justify-between gap-8 pb-5 lg:pb-7">
            {!still && (
              <div className="pointer-events-auto hidden w-64 shrink-0 lg:block">
                <div className="flex gap-1.5">
                  {text.scenes.map((s, i) => (
                    <Segment key={s.title} progress={progress} index={i} label={s.title} onSelect={() => goTo(i)} />
                  ))}
                </div>
                <p className="tabular mt-3 flex items-baseline gap-2.5 text-[12px] tracking-[0.14em] uppercase">
                  <span className="text-muted">0{scene + 1}</span>
                  <span className="font-medium">{text.scenes[scene].title}</span>
                </p>
              </div>
            )}

            <motion.div className="min-w-0 flex-1 lg:max-w-xl" style={{ opacity: railOpacity, pointerEvents: railEvents }}>
              <div className="lg:min-h-12 lg:text-right" aria-live="polite">
                {current?.soon ? (
                  <div className="inline-flex max-w-full flex-col gap-1 lg:items-end">
                    <span className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-ink-soft">
                      <Clock className="size-4 text-accent" aria-hidden />
                      {fmt(soon.title, { region: current.name })}
                    </span>
                    <span className="max-w-sm text-[13px] leading-relaxed text-muted lg:text-right">{fmt(soon.text, { region: current.name })}</span>
                  </div>
                ) : current ? (
                  <Link
                    href={`/order?region=${current.key}`}
                    className="group inline-flex max-w-full flex-col gap-1 lg:items-end"
                  >
                    <span className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
                      {current.name} <ArrowRight className="size-4 text-accent" aria-hidden /> {baku}
                    </span>
                    <span className="truncate text-[13px] text-ink-soft">{[...current.stores, current.other].filter(Boolean).join(' · ')}</span>
                    <span className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent underline-offset-4 group-hover:underline">
                      {fmt(orderLabel, { region: current.name })}
                      <ArrowUpRight className="size-3.5" aria-hidden />
                    </span>
                  </Link>
                ) : (
                  <p className="hidden pt-6 text-[12px] tracking-[0.14em] text-muted uppercase lg:block">{text.explore}</p>
                )}
              </div>
              <div role="group" aria-label={text.explore} className="mt-3 flex flex-wrap gap-1.5 lg:justify-end">
                {regions.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    aria-pressed={selected === r.key}
                    onClick={() => setSelected(selected === r.key ? null : r.key)}
                    title={r.soon ? fmt(soon.title, { region: r.name }) : undefined}
                    className={cn(
                      'flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-medium tracking-[0.12em] uppercase backdrop-blur-sm transition-colors duration-300',
                      r.soon
                        ? selected === r.key
                          ? 'border-dashed border-white/50 bg-black/60 text-ink'
                          : 'border-dashed border-white/20 bg-black/40 text-muted hover:border-white/50'
                        : selected === r.key
                          ? 'border-accent bg-accent text-on-accent'
                          : 'border-white/15 bg-black/40 text-ink-soft hover:border-accent hover:text-ink',
                    )}
                  >
                    {r.name}
                    {r.soon && <span className="text-[9px] tracking-[0.18em] text-accent">{soon.badge}</span>}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-muted lg:text-right">{text.disclaimer}</p>
            </motion.div>
          </Container>
        </div>

        {!still && (
          <motion.p
            className="pointer-events-none absolute inset-x-0 bottom-7 hidden items-center justify-center gap-2 text-[11px] tracking-[0.2em] text-muted uppercase lg:flex"
            style={{ opacity: hint }}
            aria-hidden
          >
            <ArrowDown className="hero-float size-3.5" />
            {text.scroll}
          </motion.p>
        )}
      </div>
    </section>
  );
}
