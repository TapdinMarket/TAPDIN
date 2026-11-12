// Design-system primitives (shadcn-style: small, composable, Tailwind-driven).
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/format';

// ── Buttons ──────────────────────────────────────────────────────
type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-soft',
  accent: 'bg-accent text-white hover:bg-accent-hover',
  secondary: 'border border-line-strong bg-surface text-ink hover:border-ink/40',
  ghost: 'text-ink hover:bg-ink/5',
  danger: 'border border-danger/25 bg-surface text-danger hover:bg-danger-soft',
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-13 px-7 text-[15px]',
};

export const buttonClass = (variant: Variant = 'primary', size: Size = 'md', className?: string) =>
  cn(
    'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-colors',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:pointer-events-none disabled:opacity-50',
    variants[variant],
    sizes[size],
    className,
  );

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ── Form controls ────────────────────────────────────────────────
const control =
  'w-full rounded-control border border-line-strong bg-surface px-3.5 text-base text-ink placeholder:text-muted/60 transition-colors sm:text-[15px] ' +
  'focus:border-ink focus:ring-2 focus:ring-ink/10 focus:outline-none disabled:bg-paper disabled:text-muted aria-[invalid=true]:border-danger';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(control, 'h-11', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(control, 'min-h-24 py-2.5 leading-relaxed', className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(control, 'h-11 appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236c6e67' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  optional?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-medium text-ink-soft">
        {label}
        {optional && <span className="font-normal text-muted">{optional}</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-[13px] text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[13px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

// ── Surfaces ─────────────────────────────────────────────────────
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded-card border border-line bg-surface shadow-card', className)} {...props} />;
}

export function CardHeader({ title, action, hint }: { title: string; action?: ReactNode; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function Container({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mx-auto w-full max-w-6xl px-5 sm:px-8', className)} {...props} />;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[12px] font-medium tracking-[0.14em] text-muted uppercase', className)}>{children}</p>;
}

// ── Status indicators ────────────────────────────────────────────
type Tone = 'neutral' | 'accent' | 'warn' | 'danger' | 'info';
const tones: Record<Tone, string> = {
  neutral: 'bg-ink/5 text-ink-soft',
  accent: 'bg-accent-soft text-accent',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] leading-none font-medium whitespace-nowrap', tones[tone], className)}>
      {children}
    </span>
  );
}

const statusTones: Record<string, Tone> = {
  request_received: 'neutral',
  price_calculation: 'neutral',
  awaiting_approval: 'warn',
  awaiting_payment: 'warn',
  completed: 'accent',
  cancelled: 'danger',
};

export function StatusBadge({ statusKey, label }: { statusKey: string; label: string }) {
  const tone = statusTones[statusKey] ?? 'info';
  return (
    <Badge tone={tone}>
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </Badge>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 size-10 rounded-full border border-dashed border-line-strong" />
      <p className="font-medium">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Label/value row used in detail panels. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-2.5 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}
