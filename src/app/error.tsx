'use client';
import { Button } from '@/components/ui';
import { useI18n } from '@/i18n/client';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const { m } = useI18n();
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold">{m.common.error}</h1>
      <Button onClick={reset} className="mt-6">{m.common.retry}</Button>
    </div>
  );
}
