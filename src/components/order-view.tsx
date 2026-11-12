// Presentational pieces shared by the customer order page and the admin order page.
import { Check } from 'lucide-react';
import { statusLabel } from '@/i18n/config';
import type { Messages } from '@/i18n/messages/en';
import { cn, formatDate } from '@/lib/format';

type StatusDef = { key: string; labelAz: string; labelRu: string; labelEn: string; showOnTimeline: boolean; active: boolean };

/** Vertical progress timeline built from the admin-configured status list. */
export function OrderTimeline({
  statuses,
  currentKey,
  reachedAt,
  locale,
}: {
  statuses: StatusDef[];
  currentKey: string;
  reachedAt: Record<string, Date>;
  locale: string;
}) {
  const steps = statuses.filter((s) => s.active && s.showOnTimeline);
  const currentIndex = steps.findIndex((s) => s.key === currentKey);
  const isLast = currentIndex === steps.length - 1;

  return (
    <ol>
      {steps.map((s, i) => {
        const done = currentIndex >= 0 && (i < currentIndex || (isLast && i === currentIndex));
        const current = i === currentIndex && !isLast;
        return (
          <li key={s.key} className="relative grid grid-cols-[1.5rem_1fr] gap-x-3 pb-5 last:pb-0">
            {i < steps.length - 1 && (
              <span className={cn('absolute top-6 bottom-0 left-[0.6875rem] w-0.5', done ? 'bg-accent' : 'bg-line')} aria-hidden />
            )}
            <span
              className={cn(
                'relative mt-0.5 flex size-6 items-center justify-center rounded-full border-2',
                done && 'border-accent bg-accent text-white',
                current && 'border-accent bg-surface',
                !done && !current && 'border-line-strong bg-surface',
              )}
            >
              {done && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
              {current && <span className="size-2 animate-pulse rounded-full bg-accent" />}
            </span>
            <div className="min-w-0">
              <p className={cn('text-sm leading-6', current ? 'font-semibold' : done ? 'text-ink' : 'text-muted')} aria-current={current ? 'step' : undefined}>
                {statusLabel(s, locale)}
              </p>
              {reachedAt[s.key] && (done || current) && <p className="text-[12px] text-muted">{formatDate(reachedAt[s.key], locale)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

type Media = { id: string; mimeType: string };

export function MediaGrid({ media, className }: { media: Media[]; className?: string }) {
  return (
    <ul className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3', className)}>
      {media.map((item) => (
        <li key={item.id} className="overflow-hidden rounded-control border border-line bg-paper">
          {item.mimeType.startsWith('video/') ? (
            <video src={`/api/media/${item.id}`} controls preload="metadata" playsInline className="aspect-square w-full bg-ink object-contain" />
          ) : (
            <a href={`/api/media/${item.id}`} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/media/${item.id}`} alt="" loading="lazy" className="aspect-square w-full object-cover transition-opacity hover:opacity-90" />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

type EventItem = { id: string; description: string; status: string | null; createdAt: Date; visible: boolean };

export function eventText(e: { description: string; status: string | null }, m: Messages, statuses: StatusDef[], locale: string) {
  if (e.description === 'status_changed' && e.status) {
    const s = statuses.find((x) => x.key === e.status);
    return s ? statusLabel(s, locale) : m.events.status_changed;
  }
  return (m.events as Record<string, string>)[e.description] ?? e.description;
}

export function EventList({
  events,
  m,
  statuses,
  locale,
  internalLabel,
}: {
  events: EventItem[];
  m: Messages;
  statuses: StatusDef[];
  locale: string;
  internalLabel?: string;
}) {
  return (
    <ul className="divide-y divide-line text-sm">
      {events.map((e) => (
        <li key={e.id} className="flex items-baseline justify-between gap-4 py-2.5">
          <span>
            {eventText(e, m, statuses, locale)}
            {!e.visible && internalLabel && <span className="ml-2 text-[12px] text-muted">({internalLabel})</span>}
          </span>
          <time className="tabular shrink-0 text-[12px] text-muted">{formatDate(e.createdAt, locale, true)}</time>
        </li>
      ))}
    </ul>
  );
}
