import { ButtonLink } from '@/components/ui';
import { getI18n } from '@/i18n/server';

export default async function NotFound() {
  const { m } = await getI18n();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="tabular font-display text-sm text-muted">404</p>
      <h1 className="mt-3 text-3xl font-semibold">{m.common.notFoundTitle}</h1>
      <p className="mt-2 max-w-sm text-ink-soft">{m.common.notFoundText}</p>
      <ButtonLink href="/" className="mt-8">{m.common.home}</ButtonLink>
    </div>
  );
}
