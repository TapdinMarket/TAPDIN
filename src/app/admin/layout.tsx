import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { logoutAction } from '@/app/actions/auth';
import { AdminNav } from '@/components/admin-nav';
import { LocaleSwitcher } from '@/components/header-client';
import { Logo } from '@/components/site-header';
import { Badge } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Route protection: every admin page renders inside this layout, and every
  // server action / API route re-checks the role independently.
  const user = await requireStaff();
  const { m, locale } = await getI18n();
  const n = m.admin.nav;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="border-b border-line bg-surface px-4 py-3 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0 lg:px-4 lg:py-6">
        <div className="mb-3 flex items-center justify-between gap-3 lg:mb-8 lg:px-2">
          <div className="flex items-center gap-2.5">
            <Logo />
            <Badge>{user.role === 'ADMIN' ? 'Admin' : 'Staff'}</Badge>
          </div>
          <div className="flex items-center lg:hidden">
            <LocaleSwitcher locale={locale} label={m.nav.language} />
            <Link href="/" className="rounded-full px-2.5 py-2 text-sm text-ink-soft hover:text-ink" aria-label={n.site}>
              <ArrowUpRight className="size-4" aria-hidden />
            </Link>
            <form action={logoutAction}>
              <button className="cursor-pointer rounded-full px-2.5 py-2 text-sm text-ink-soft hover:text-ink">{m.nav.logout}</button>
            </form>
          </div>
        </div>
        <AdminNav
          items={[
            { href: '/admin', label: n.overview, icon: 'overview' },
            { href: '/admin/orders', label: n.orders, icon: 'orders' },
            { href: '/admin/customers', label: n.customers, icon: 'customers' },
            { href: '/admin/settings', label: n.settings, icon: 'settings' },
          ]}
        />
        <div className="mt-auto hidden space-y-1 border-t border-line pt-4 text-sm lg:block">
          <LocaleSwitcher locale={locale} label={m.nav.language} />
          <Link href="/" className="flex items-center gap-2 rounded-control px-3 py-2 text-ink-soft hover:bg-ink/5">
            <ArrowUpRight className="size-4" aria-hidden />
            {n.site}
          </Link>
          <p className="truncate px-3 pt-2 text-[12px] text-muted">{user.email}</p>
          <form action={logoutAction}>
            <button className="w-full cursor-pointer rounded-control px-3 py-2 text-left text-ink-soft hover:bg-ink/5">{m.nav.logout}</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8 lg:py-10">{children}</main>
    </div>
  );
}
