'use client';
import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { Container } from '@/components/ui';
import { cn } from '@/lib/format';

type Step = { title: string; text: string };

/**
 * "How it works" as a horizontal journey: on desktop the section pins and vertical scroll moves the
 * steps sideways. On small screens and with reduced motion it is a plain vertical list.
 */
export function ProcessRail({ eyebrow, title, steps }: { eyebrow: string; title: string; steps: Step[] }) {
  const section = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLOListElement>(null);
  const [pinned, setPinned] = useState(false);
  const [distance, setDistance] = useState(0);
  const { scrollYProgress } = useScroll({ target: section, offset: ['start start', 'end end'] });
  const x = useTransform(scrollYProgress, [0.04, 0.96], [0, -distance]);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px) and (prefers-reduced-motion: no-preference)');
    const update = () => setPinned(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!pinned || !track.current || !viewport.current) return;
    // The observer can fire once more while the section is unmounting: refs may already be empty.
    const measure = () => {
      if (!track.current || !viewport.current) return;
      setDistance(Math.max(0, track.current.scrollWidth - viewport.current.clientWidth));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track.current);
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [pinned]);

  return (
    <section ref={section} className="relative border-t border-line" style={pinned ? { height: `${steps.length * 62 + 60}vh` } : undefined}>
      <div className={cn(pinned && 'sticky top-16 flex h-[calc(100svh-4rem)] flex-col justify-center overflow-hidden')}>
        <Container className={cn('pt-20', pinned ? 'pt-0' : 'lg:pt-28')}>
          <p className="text-[12px] font-medium tracking-[0.2em] text-accent uppercase">{eyebrow}</p>
          <h2 className="display mt-4 max-w-4xl text-[clamp(2.2rem,5.4vw,4.75rem)]">{title}</h2>
        </Container>

        <div ref={viewport} className={cn('mt-10 lg:mt-14', !pinned && 'pb-20')}>
          <motion.ol
            ref={track}
            style={pinned ? { x } : undefined}
            className={cn(
              pinned ? 'flex w-max gap-5 pr-[8vw] pl-[max(1.25rem,calc((100vw-80rem)/2+2rem))] will-change-transform' : 'mx-auto grid max-w-7xl gap-4 px-5 sm:grid-cols-2 sm:px-8',
            )}
          >
            {steps.map((step, i) => (
              <li
                key={step.title}
                className={cn(
                  'group relative flex flex-col justify-between overflow-hidden rounded-card border border-line bg-surface p-7 transition-colors duration-500 hover:border-accent/50 sm:p-9',
                  pinned ? 'h-[min(46svh,26rem)] w-[min(34rem,42vw)] shrink-0' : 'min-h-64',
                )}
              >
                <span className="display pointer-events-none absolute -top-4 right-4 text-[11rem] text-white/[0.035] transition-colors duration-500 select-none group-hover:text-accent/15" aria-hidden>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="tabular flex items-center gap-3 text-[12px] font-medium tracking-[0.2em] text-accent">
                  {String(i + 1).padStart(2, '0')}
                  <span className="h-px w-10 bg-accent/50" aria-hidden />
                </span>
                <div className="relative mt-16">
                  <h3 className="display text-[clamp(1.6rem,2.6vw,2.4rem)]">{step.title}</h3>
                  <p className="mt-4 max-w-sm leading-relaxed text-ink-soft">{step.text}</p>
                </div>
              </li>
            ))}
          </motion.ol>
        </div>

        {pinned && (
          <Container className="mt-10">
            <div className="h-px w-full bg-line-strong">
              <motion.div className="h-px origin-left bg-accent" style={{ scaleX: scrollYProgress }} />
            </div>
          </Container>
        )}
      </div>
    </section>
  );
}
