import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from './config';
import { az } from './messages/az';
import { en, type Messages } from './messages/en';
import { ru } from './messages/ru';

const dictionaries: Record<Locale, Messages> = { az, ru, en };

/** Locale + dictionary for the current request. Azerbaijani is the default. */
export const getI18n = cache(async () => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(value) ? value : defaultLocale;
  return { locale, m: dictionaries[locale] };
});
