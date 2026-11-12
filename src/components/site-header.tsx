import Link from 'next/link';
import { logoutAction } from '@/app/actions/auth';
import { brand } from '@/config/brand';
import { getI18n } from '@/i18n/server';
import { getCurrentUser, isStaff } from '@/lib/auth';
import { HeaderMenu, LocaleSwitcher } from './header-client';
import { ButtonLink, Container } from './ui';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link href="/" className={`font-display text-[22px] leading-none font-semibold tracking-tight ${className}`} aria-label={brand.legalName}>
      {brand.name}
      <span className="text-accent">.</span>
    </Link>
  );
}

export async function SiteHeader() {
  const [{ m, locale }, user] = await Promise.all([getI18n(), getCurrentUser()]);
  const staff = isStaff(user);

  const links = [
    { href: '/how-it-works', label: m.nav.how },
    { href: '/pricing', label: m.nav.pricing },
    ...(user ? [{ href: '/dashboard', label: m.nav.dashboard }] : []),
    ...(staff ? [{ href: '/admin', label: m.nav.admin }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/90 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-10">
          <Logo />
          <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-sm text-ink-soft transition-colors hover:text-ink">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <LocaleSwitcher locale={locale} label={m.nav.language} />
          {user ? (
            <form action={logoutAction}>
              <button className="cursor-pointer rounded-full px-3 py-2 text-sm text-ink-soft hover:text-ink">{m.nav.logout}</button>
            </form>
          ) : (
            <Link href="/login" className="rounded-full px-3 py-2 text-sm text-ink-soft hover:text-ink">
              {m.nav.login}
            </Link>
          )}
          <ButtonLink href="/order" size="sm" className="h-10 px-4.5">
            {m.nav.order}
          </ButtonLink>
        </div>

        <HeaderMenu
          locale={locale}
          labels={{ menu: m.nav.menu, language: m.nav.language, order: m.nav.order, login: m.nav.login, register: m.nav.register, logout: m.nav.logout }}
          links={links}
          signedIn={!!user}
          logout={logoutAction}
        />
      </Container>
    </header>
  );
}
