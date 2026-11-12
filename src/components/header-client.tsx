'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { Globe, Menu, X } from 'lucide-react';
import { setLocaleAction } from '@/app/actions/auth';
import { localeNames, locales, type Locale } from '@/i18n/config';
import { cn } from '@/lib/format';
import { buttonClass } from './ui';

export function LocaleSwitcher({ locale, label, className }: { locale: Locale; label: string; className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className={cn('relative inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-ink-soft hover:text-ink', pending && 'opacity-60', className)}>
      <Globe className="size-4" aria-hidden />
      <span className="sr-only">{label}</span>
      <span className="uppercase">{locale}</span>
      <select
        aria-label={label}
        value={locale}
        onChange={(e) =>
          startTransition(async () => {
            await setLocaleAction(e.target.value);
            router.refresh();
          })
        }
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {localeNames[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function HeaderMenu({
  locale,
  labels,
  links,
  signedIn,
  logout,
}: {
  locale: Locale;
  labels: { menu: string; language: string; order: string; login: string; register: string; logout: string };
  links: { href: string; label: string }[];
  signedIn: boolean;
  logout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <div className="flex items-center gap-1 md:hidden">
      <LocaleSwitcher locale={locale} label={labels.language} />
      <button
        type="button"
        aria-label={labels.menu}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="-mr-2 inline-flex size-10 cursor-pointer items-center justify-center rounded-full hover:bg-ink/5"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {/* Portalled to <body>: the header's backdrop-filter would otherwise become the containing block of this fixed panel. */}
      {open && createPortal(
        <div className="fixed inset-x-0 top-16 bottom-0 z-50 flex flex-col overflow-y-auto border-t border-line bg-paper px-5 pt-2 pb-8 md:hidden">
          <nav className="flex flex-col" aria-label="Mobile">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="border-b border-line py-4 font-display text-xl font-medium tracking-tight">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-3 pt-8">
            <Link href="/order" className={buttonClass('primary', 'lg', 'w-full')}>
              {labels.order}
            </Link>
            {signedIn ? (
              <form action={logout}>
                <button className={buttonClass('secondary', 'lg', 'w-full')}>{labels.logout}</button>
              </form>
            ) : (
              <>
                <Link href="/login" className={buttonClass('secondary', 'lg', 'w-full')}>
                  {labels.login}
                </Link>
                <Link href="/register" className="py-2 text-center text-sm text-ink-soft underline underline-offset-4">
                  {labels.register}
                </Link>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
