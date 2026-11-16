import type { Metadata } from 'next';
import Link from 'next/link';
import { requestPasswordResetAction } from '@/app/actions/auth';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Card, Container, Field, Input } from '@/components/ui';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.auth.forgotTitle };
}

export default async function ForgotPage() {
  const { m } = await getI18n();
  return (
    <Container className="flex max-w-md flex-col py-14 lg:py-24">
      <h1 className="text-3xl font-semibold tracking-[-0.03em]">{m.auth.forgotTitle}</h1>
      <p className="mt-2 text-ink-soft">{m.auth.forgotSubtitle}</p>
      <Card className="mt-8 p-6 sm:p-7">
        <ActionForm action={requestPasswordResetAction} className="space-y-4">
          <Field label={m.auth.email}>
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <SubmitButton size="lg" className="mt-2 w-full">{m.auth.forgotButton}</SubmitButton>
        </ActionForm>
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-ink underline underline-offset-4">{m.nav.login}</Link>
      </p>
    </Container>
  );
}
