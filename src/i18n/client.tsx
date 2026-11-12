'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { Locale } from './config';
import type { Messages } from './messages/en';

type Ctx = { locale: Locale; m: Messages };
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ locale, m, children }: Ctx & { children: ReactNode }) {
  return <I18nContext.Provider value={{ locale, m }}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
