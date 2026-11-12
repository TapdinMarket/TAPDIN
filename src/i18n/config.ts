export const locales = ['az', 'ru', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'az';
export const LOCALE_COOKIE = 'tq_locale';
export const localeNames: Record<Locale, string> = { az: 'Azərbaycanca', ru: 'Русский', en: 'English' };
export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (locales as readonly string[]).includes(v);

type StatusLabels = { labelAz: string; labelRu: string; labelEn: string };
export const statusLabel = (s: StatusLabels, locale: string) =>
  locale === 'ru' ? s.labelRu : locale === 'en' ? s.labelEn : s.labelAz;
