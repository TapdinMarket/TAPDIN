import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { registerAction } from '@/app/actions/auth';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Card, Container, Field, Input } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { getCurrentUser, safeNext } from '@/lib/auth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.nav.register };
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ m }, user, { next }] = await Promise.all([getI18n(), getCurrentUser(), searchParams]);
  if (user) redirect(safeNext(next, '/dashboard'));
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : '';

  return (
    <Container className="flex max-w-md flex-col py-14 lg:py-24">
      <h1 className="text-3xl font-semibold tracking-[-0.03em]">{m.auth.registerTitle}</h1>
      <p className="mt-2 text-ink-soft">{m.auth.registerSubtitle}</p>
      <Card className="mt-8 p-6 sm:p-7">
        <ActionForm action={registerAction} className="space-y-4">
          <input type="hidden" name="next" value={next ?? ''} />
          <Field label={m.auth.name}>
            <Input name="name" autoComplete="name" required minLength={2} maxLength={100} />
          </Field>
          <Field label={m.auth.email}>
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label={m.auth.phone}>
            <Input name="phone" type="tel" autoComplete="tel" placeholder="+994 50 000 00 00" required />
          </Field>
          <Field label={m.auth.password} hint={m.auth.passwordHint}>
            <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
          <SubmitButton size="lg" className="mt-2 w-full">
            {m.auth.registerButton}
          </SubmitButton>
        </ActionForm>
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        {m.auth.haveAccount}{' '}
        <Link href={`/login${nextQuery}`} className="font-medium text-ink underline underline-offset-4">
          {m.nav.login}
        </Link>
      </p>
    </Container>
  );
}
