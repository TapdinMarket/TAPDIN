import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { loginAction } from '@/app/actions/auth';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Card, Container, Field, Input } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { getCurrentUser, isStaff, safeNext } from '@/lib/auth';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.nav.login };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ m }, user, { next }] = await Promise.all([getI18n(), getCurrentUser(), searchParams]);
  if (user) redirect(safeNext(next, isStaff(user) ? '/admin' : '/dashboard'));
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : '';

  return (
    <Container className="flex max-w-md flex-col py-14 lg:py-24">
      <h1 className="text-3xl font-semibold tracking-[-0.03em]">{m.auth.loginTitle}</h1>
      <p className="mt-2 text-ink-soft">{m.auth.loginSubtitle}</p>
      <Card className="mt-8 p-6 sm:p-7">
        <ActionForm action={loginAction} className="space-y-4">
          <input type="hidden" name="next" value={next ?? ''} />
          <Field label={m.auth.email}>
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label={m.auth.password}>
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <SubmitButton size="lg" className="mt-2 w-full">
            {m.auth.loginButton}
          </SubmitButton>
        </ActionForm>
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        {m.auth.noAccount}{' '}
        <Link href={`/register${nextQuery}`} className="font-medium text-ink underline underline-offset-4">
          {m.nav.register}
        </Link>
      </p>
    </Container>
  );
}
