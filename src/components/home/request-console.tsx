'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Camera, Clock, Link2 } from 'lucide-react';
import { useI18n } from '@/i18n/client';
import { cn, fmt } from '@/lib/format';

type Mode = 'URL' | 'IMAGE';

/**
 * Homepage entry point into the real order form: link or photo, plus the sourcing region.
 * Nothing is submitted here — the choices are carried to /order, where the request is actually created.
 */
export function RequestConsole({ regions }: { regions: { key: string; name: string; soon: boolean }[] }) {
  const { m } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('URL');
  const [url, setUrl] = useState('');
  const [region, setRegion] = useState('');
  const [soonNote, setSoonNote] = useState<string | null>(null);

  const tabs: { key: Mode; label: string; icon: typeof Link2 }[] = [
    { key: 'URL', label: m.order.tabUrl, icon: Link2 },
    { key: 'IMAGE', label: m.order.tabImage, icon: Camera },
  ];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const query = new URLSearchParams();
        if (mode === 'IMAGE') query.set('mode', 'image');
        else if (url.trim()) query.set('url', url.trim());
        if (region) query.set('region', region);
        router.push(`/order${query.size ? `?${query}` : ''}`);
      }}
      className="rounded-[1.75rem] border border-line-strong bg-surface p-2 shadow-float"
    >
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-[1.25rem] bg-paper p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={mode === t.key}
            onClick={() => setMode(t.key)}
            className={cn(
              'flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[1rem] text-sm font-medium transition-colors duration-300',
              mode === t.key ? 'bg-raised text-ink' : 'text-muted hover:text-ink',
            )}
          >
            <t.icon className="size-4" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-6 p-4 sm:p-6">
        {mode === 'URL' ? (
          <label className="block">
            <span className="text-[12px] font-medium tracking-[0.14em] text-muted uppercase">{m.order.url}</span>
            <input
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={m.home.hero.urlPlaceholder}
              className="mt-2 h-14 w-full border-b border-line-strong bg-transparent font-display text-xl tracking-tight placeholder:text-muted/50 focus:border-accent focus:outline-none sm:text-2xl"
            />
          </label>
        ) : (
          <div className="flex items-center gap-4 rounded-card border border-dashed border-line-strong p-5">
            <Camera className="size-6 shrink-0 text-accent" strokeWidth={1.5} aria-hidden />
            <div>
              <p className="font-medium">{m.order.drop}</p>
              <p className="mt-1 text-[13px] text-muted">{m.order.dropHint}</p>
            </div>
          </div>
        )}

        <fieldset>
          <legend className="text-[12px] font-medium tracking-[0.14em] text-muted uppercase">{m.order.region}</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {[{ key: '', name: m.order.regionUnknown, soon: false }, ...regions].map((r) =>
              r.soon ? (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setSoonNote(fmt(m.soon.text, { region: r.name }))}
                  className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-dashed border-line-strong px-4 text-sm font-medium text-muted transition-colors hover:border-white/40"
                >
                  {r.name}
                  <span className="text-[9px] font-semibold tracking-[0.18em] text-accent uppercase">{m.soon.badge}</span>
                </button>
              ) : (
              <label
                key={r.key}
                className={cn(
                  'flex h-10 cursor-pointer items-center rounded-full border px-4 text-sm font-medium transition-colors duration-300 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink',
                  region === r.key ? 'border-accent bg-accent text-on-accent' : 'border-line-strong text-ink-soft hover:border-ink/40',
                )}
              >
                <input type="radio" name="region" value={r.key} checked={region === r.key} onChange={() => setRegion(r.key)} className="sr-only" />
                {r.name}
              </label>
              ),
            )}
          </div>
          {soonNote && (
            <p role="status" className="mt-3 flex gap-2 text-[13px] leading-relaxed text-ink-soft">
              <Clock className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
              {soonNote}
            </p>
          )}
        </fieldset>

        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-muted">{m.order.free}</p>
          <button className="group inline-flex h-13 cursor-pointer items-center justify-center gap-2 rounded-full bg-accent px-7 text-[15px] font-medium text-on-accent transition-colors hover:bg-accent-hover">
            {mode === 'URL' ? m.home.hero.urlButton : m.order.tabImage}
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
          </button>
        </div>
      </div>
    </form>
  );
}
