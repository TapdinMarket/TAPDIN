import type { Metadata, Viewport } from 'next';
import { Inter, Inter_Tight } from 'next/font/google';
import type { ReactNode } from 'react';
import { brand } from '@/config/brand';
import { I18nProvider } from '@/i18n/client';
import { getI18n } from '@/i18n/server';
import './globals.css';

const inter = Inter({ subsets: ['latin', 'latin-ext', 'cyrillic'], variable: '--font-inter', display: 'swap' });
const interTight = Inter_Tight({ subsets: ['latin', 'latin-ext', 'cyrillic'], variable: '--font-inter-tight', display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return {
    title: { default: `${brand.legalName} — ${m.home.hero.title}`, template: `%s · ${brand.legalName}` },
    description: m.home.hero.subtitle,
    metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  };
}

export const viewport: Viewport = { themeColor: '#f6f5f1', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { locale, m } = await getI18n();
  return (
    <html lang={locale} className={`${inter.variable} ${interTight.variable}`}>
      <body className="min-h-dvh">
        <I18nProvider locale={locale} m={m}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
