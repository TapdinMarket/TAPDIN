import Link from 'next/link';
import { brand } from '@/config/brand';
import { regionLabel } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { isComingSoon, isPublic } from '@/lib/regions';
import { getCatalog, getSettings } from '@/lib/settings';
import { Container } from './ui';

export async function SiteFooter() {
  const [{ m }, { contact }, catalog] = await Promise.all([getI18n(), getSettings(), getCatalog()]);
  const regions = catalog.regions.filter(isPublic);
  const link = 'transition-colors hover:text-accent';

  return (
    <footer className="relative overflow-hidden border-t border-line bg-paper">
      <Container className="grid gap-12 pt-16 pb-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <p className="max-w-xs leading-relaxed text-ink-soft">{m.footer.about}</p>
          <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium tracking-[0.16em] text-muted uppercase">
            {regions.map((r) => (
              <span key={r.key} className={isComingSoon(r) ? 'flex items-center gap-2 text-muted/60' : 'flex items-center gap-2'}>
                {regionLabel(m, r)}
                {isComingSoon(r) && <span className="text-[9px] text-accent/80">({m.soon.badge})</span>}
                <span className="size-1 rounded-full bg-accent" aria-hidden />
              </span>
            ))}
            <span className="text-ink">{m.home.routes.baku}</span>
          </p>
        </div>
        <div>
          <p className="text-[12px] font-medium tracking-[0.16em] text-muted uppercase">{m.footer.service}</p>
          <ul className="mt-5 space-y-3 text-sm text-ink-soft">
            <li><Link className={link} href="/order">{m.nav.order}</Link></li>
            <li><Link className={link} href="/how-it-works">{m.nav.how}</Link></li>
            <li><Link className={link} href="/pricing">{m.nav.pricing}</Link></li>
            <li><Link className={link} href="/terms">{m.footer.terms}</Link></li>
            <li><Link className={link} href="/privacy">{m.footer.privacy}</Link></li>
            <li><Link className={link} href="/dashboard">{m.nav.dashboard}</Link></li>
          </ul>
        </div>
        <div className="md:col-span-2">
          <p className="text-[12px] font-medium tracking-[0.16em] text-muted uppercase">{m.footer.contact}</p>
          <ul className="mt-5 space-y-3 text-sm text-ink-soft">
            {contact.phone && <li><a className={link} href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`}>{contact.phone}</a></li>}
            {contact.whatsapp && <li><a className={link} href={`https://wa.me/${contact.whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></li>}
            {contact.email && <li><a className={link} href={`mailto:${contact.email}`}>{contact.email}</a></li>}
            {contact.instagram && <li><a className={link} href={`https://instagram.com/${contact.instagram}`} target="_blank" rel="noopener noreferrer">@{contact.instagram}</a></li>}
            {contact.address && <li>{contact.address}</li>}
          </ul>
        </div>
      </Container>

      <Container className="flex flex-col gap-2 border-t border-line py-6 text-[13px] text-muted md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} {brand.legalName}. {m.footer.rights}</p>
        <p className="max-w-xl md:text-right">{m.footer.legal}</p>
      </Container>

      {/* Oversized wordmark, cropped by the bottom edge of the page. */}
      <Link href="/" aria-label={brand.legalName} className="group block select-none">
        <p className="pt-2 pb-[3vw] text-center font-display text-[25vw] leading-[0.8] font-semibold tracking-[-0.06em] text-raised transition-colors duration-700 group-hover:text-ink" aria-hidden>
          {brand.name}
          <span className="text-accent">.</span>
        </p>
      </Link>
    </footer>
  );
}
