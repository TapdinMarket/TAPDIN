'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Camera, Link2 } from 'lucide-react';
import { useI18n } from '@/i18n/client';

/** Homepage entry point: carries the pasted link into the order form. Nothing is submitted here. */
export function HeroQuickStart() {
  const { m } = useI18n();
  const router = useRouter();
  const [url, setUrl] = useState('');

  return (
    <div className="w-full max-w-xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const value = url.trim();
          router.push(value ? `/order?url=${encodeURIComponent(value)}` : '/order');
        }}
        className="flex items-center gap-2 rounded-full border border-line-strong bg-surface p-1.5 pl-4 shadow-card transition-colors focus-within:border-ink"
      >
        <Link2 className="size-4.5 shrink-0 text-muted" aria-hidden />
        <input
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={m.home.hero.urlPlaceholder}
          aria-label={m.order.url}
          className="h-11 min-w-0 flex-1 bg-transparent text-base placeholder:text-muted/70 focus:outline-none"
        />
        <button className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-white transition-colors hover:bg-ink-soft">
          <span className="hidden sm:inline">{m.home.hero.urlButton}</span>
          <ArrowRight className="size-4" aria-hidden />
          <span className="sr-only sm:hidden">{m.home.hero.urlButton}</span>
        </button>
      </form>
      <Link href="/order?mode=image" className="mt-3 inline-flex items-center gap-2 px-2 text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline">
        <Camera className="size-4" aria-hidden />
        {m.home.hero.photoLink}
      </Link>
    </div>
  );
}
