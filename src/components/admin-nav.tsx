'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Package, Settings, Users } from 'lucide-react';
import { cn } from '@/lib/format';

const icons = { overview: LayoutDashboard, orders: Package, customers: Users, settings: Settings };

export function AdminNav({ items }: { items: { href: string; label: string; icon: keyof typeof icons }[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Admin">
      {items.map((item) => {
        const Icon = icons[item.icon];
        const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-2.5 rounded-control px-3 py-2.5 text-sm font-medium transition-colors',
              active ? 'bg-ink text-white' : 'text-ink-soft hover:bg-ink/5',
            )}
          >
            <Icon className="size-4" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
