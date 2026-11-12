// Shared formatting helpers (safe for client and server).
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

const intlLocale = (locale: string) => (locale === 'az' ? 'az-Latn-AZ' : locale === 'ru' ? 'ru-RU' : 'en-GB');

/**
 * Deterministic number formatting. Intl.NumberFormat is avoided on purpose: browsers without
 * Azerbaijani locale data format differently from the server and cause hydration mismatches.
 */
export function formatNumber(amount: number, locale = 'az') {
  const [int, dec] = Math.abs(amount).toFixed(2).split('.');
  const group = locale === 'en' ? ',' : locale === 'ru' ? ' ' : '.';
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return `${amount < 0 ? '-' : ''}${grouped}${locale === 'en' ? '.' : ','}${dec}`;
}

export function formatAzn(amount: number, locale = 'az') {
  return `${formatNumber(amount, locale)} ₼`;
}

export function formatMoney(amount: number, currency: string, locale = 'az') {
  return currency === 'AZN' ? formatAzn(amount, locale) : `${formatNumber(amount, locale)} ${currency}`;
}

export function formatDate(date: Date | string, locale = 'az', withTime = false) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'Asia/Baku',
  }).format(new Date(date));
}

/** Replace `{name}` placeholders in a translated string. */
export function fmt(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
