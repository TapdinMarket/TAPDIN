import Link from 'next/link';
import { brand } from '@/config/brand';
import { getI18n } from '@/i18n/server';
import { getSettings } from '@/lib/settings';
import { Logo } from './site-header';
import { Container } from './ui';

export async function SiteFooter() {
  const [{ m }, { contact }] = await Promise.all([getI18n(), getSettings()]);

  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <Container className="grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">{m.footer.about}</p>
        </div>
        <div>
          <p className="text-[13px] font-medium text-ink">{m.footer.service}</p>
          <ul className="mt-4 space-y-2.5 text-sm text-muted">
            <li><Link className="hover:text-ink" href="/order">{m.nav.order}</Link></li>
            <li><Link className="hover:text-ink" href="/how-it-works">{m.nav.how}</Link></li>
            <li><Link className="hover:text-ink" href="/pricing">{m.nav.pricing}</Link></li>
            <li><Link className="hover:text-ink" href="/dashboard">{m.nav.dashboard}</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-[13px] font-medium text-ink">{m.footer.contact}</p>
          <ul className="mt-4 space-y-2.5 text-sm text-muted">
            {contact.phone && <li><a className="hover:text-ink" href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`}>{contact.phone}</a></li>}
            {contact.whatsapp && <li><a className="hover:text-ink" href={`https://wa.me/${contact.whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></li>}
            {contact.email && <li><a className="hover:text-ink" href={`mailto:${contact.email}`}>{contact.email}</a></li>}
            {contact.instagram && <li><a className="hover:text-ink" href={`https://instagram.com/${contact.instagram}`} target="_blank" rel="noopener noreferrer">@{contact.instagram}</a></li>}
            {contact.address && <li>{contact.address}</li>}
          </ul>
        </div>
      </Container>
      <Container className="flex flex-col gap-2 border-t border-line py-6 text-[13px] text-muted md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} {brand.legalName}. {m.footer.rights}</p>
        <p className="max-w-xl md:text-right">{m.footer.legal}</p>
      </Container>
    </footer>
  );
}
