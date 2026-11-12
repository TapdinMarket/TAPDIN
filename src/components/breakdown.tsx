import { cn } from '@/lib/format';

export type BreakdownLine = { label: string; value: string; hint?: string };

/** Line-by-line price breakdown used everywhere a quotation is shown. */
export function Breakdown({ lines, total, className }: { lines: BreakdownLine[]; total: { label: string; value: string }; className?: string }) {
  return (
    <div className={cn('tabular text-sm', className)}>
      <dl className="divide-y divide-line">
        {lines.map((l) => (
          <div key={l.label} className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-ink-soft">
              {l.label}
              {l.hint && <span className="mt-0.5 block text-[12px] text-muted">{l.hint}</span>}
            </dt>
            <dd className="shrink-0 font-medium">{l.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-ink pt-3.5">
        <span className="font-medium">{total.label}</span>
        <span className="font-display text-2xl font-semibold tracking-tight">{total.value}</span>
      </div>
    </div>
  );
}
