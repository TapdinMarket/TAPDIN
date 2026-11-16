'use client';
import type { CSSProperties } from 'react';
import { motion, useTransform, type MotionValue } from 'motion/react';
import { cn } from '@/lib/format';
import { Sneaker } from './art';

const BOX = { w: 190, h: 140, d: 190 };

/**
 * The tapdıq parcel: a CSS 3D box that lands, opens its two flaps and lets a product rise out.
 * `progress` is the hero scroll; `from` / `to` is the slice of it this animation occupies.
 */
export function ParcelBox({ progress, from, to, brand }: { progress: MotionValue<number>; from: number; to: number; brand: string }) {
  const at = (t: number) => from + (to - from) * t;
  const y = useTransform(progress, [at(0), at(0.3)], [-340, 0]);
  const scale = useTransform(progress, [at(0), at(0.3)], [0.45, 1]);
  const opacity = useTransform(progress, [at(0), at(0.12), at(0.92), at(1)], [0, 1, 1, 0]);
  const rotateX = useTransform(progress, [at(0), at(0.3)], [-8, -24]);
  const rotateY = useTransform(progress, [at(0), at(0.3), at(1)], [-80, -35, -28]);
  const inverseX = useTransform(rotateX, (v) => -v);
  const inverseY = useTransform(rotateY, (v) => -v);
  const flap = useTransform(progress, [at(0.38), at(0.6)], [0, 128]);
  const flapLeft = useTransform(flap, (v) => -v);
  const tape = useTransform(progress, [at(0.32), at(0.4)], [1, 0]);
  const productY = useTransform(progress, [at(0.55), at(0.82)], [20, -236]);
  const productScale = useTransform(progress, [at(0.55), at(0.82)], [0.55, 1]);
  const productOpacity = useTransform(progress, [at(0.52), at(0.6)], [0, 1]);
  const shadow = useTransform(progress, [at(0.05), at(0.3), at(0.92), at(1)], [0, 0.55, 0.55, 0]);

  const { w, h, d } = BOX;
  const face = 'absolute inset-0 [outline:1px_solid_rgb(0_0_0/0.18)] [outline-offset:-1px]';
  const lid: CSSProperties = { position: 'absolute', left: 0, top: (h - d) / 2, width: w, height: d };
  const flapClass = 'absolute inset-y-0 w-1/2 bg-[#ff7442] [outline:1px_solid_rgb(0_0_0/0.16)] [outline-offset:-1px]';

  return (
    <div className="relative" style={{ width: w, height: h }} aria-hidden>
      <motion.div className="absolute top-[118%] left-1/2 h-11 w-60 -translate-x-1/2 rounded-[50%] bg-accent/50 blur-2xl" style={{ opacity: shadow }} />
      <motion.div className="absolute inset-0" style={{ y, scale, opacity, perspective: 1100 }}>
        <motion.div className="hero-3d absolute inset-0" style={{ rotateX, rotateY }}>
          <div className={cn(face, 'bg-[#b83b08]')} style={{ transform: `rotateY(180deg) translateZ(${d / 2}px)` }} />
          <div className={cn(face, 'bg-[#d6470c]')} style={{ transform: `rotateY(-90deg) translateZ(${w / 2}px)` }} />
          <div className={cn(face, 'bg-[#d6470c]')} style={{ transform: `rotateY(90deg) translateZ(${w / 2}px)` }} />
          <div className="bg-[#3a1405]" style={{ ...lid, transform: `rotateX(-90deg) translateZ(${h / 2}px)` }} />

          {/* the product that comes out: kept facing the camera */}
          <div className="hero-3d absolute top-1/2 left-1/2 size-0">
            <motion.div className="hero-3d" style={{ rotateY: inverseY }}>
              <motion.div className="hero-3d" style={{ rotateX: inverseX }}>
                <motion.div style={{ position: 'absolute', width: 170, height: 114, left: -85, top: -57, y: productY, scale: productScale, opacity: productOpacity }}>
                  <Sneaker className="size-full drop-shadow-[0_18px_22px_rgb(0_0_0/0.6)]" />
                </motion.div>
              </motion.div>
            </motion.div>
          </div>

          <div className={cn(face, 'overflow-hidden bg-accent')} style={{ transform: `translateZ(${d / 2}px)` }}>
            <div className="absolute inset-0 bg-linear-to-b from-white/15 to-transparent" />
            <motion.div className="absolute top-0 left-1/2 h-9 w-7 -translate-x-1/2 bg-on-accent" style={{ opacity: tape }} />
            <p className="absolute inset-x-0 top-[46%] -translate-y-1/2 text-center font-display text-[30px] font-semibold tracking-[-0.03em] text-on-accent">{brand}.</p>
            <div className="absolute bottom-3 left-3 flex h-7 w-12 flex-col justify-center gap-[3px] rounded-[3px] bg-white/90 px-1.5">
              <span className="h-[2px] w-full bg-black/80" />
              <span className="h-[2px] w-2/3 bg-black/50" />
              <span className="h-[2px] w-5/6 bg-black/80" />
            </div>
          </div>

          <div className="hero-3d" style={{ ...lid, transform: `rotateX(90deg) translateZ(${h / 2}px)` }}>
            <motion.div className={cn(flapClass, 'left-0 origin-left')} style={{ rotateY: flapLeft }}>
              <motion.div className="absolute inset-y-0 right-0 w-3.5 bg-on-accent" style={{ opacity: tape }} />
            </motion.div>
            <motion.div className={cn(flapClass, 'right-0 origin-right')} style={{ rotateY: flap }}>
              <motion.div className="absolute inset-y-0 left-0 w-3.5 bg-on-accent" style={{ opacity: tape }} />
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
