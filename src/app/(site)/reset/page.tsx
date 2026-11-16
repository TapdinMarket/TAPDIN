import type { Metadata } from 'next';
import Link from 'next/link';
import { resetPasswordAction } from '@/app/actions/auth';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Card, Container, Field, Input } from '@/components/ui';
import { getI18n } from '@/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).m.auth.resetTitle };
}

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const [{ m }, { token }] = await Promise.all([getI18n(), searchParams]);
  return (
    <Container className="flex max-w-md flex-col py-14 lg:py-24">
      <h1 className="text-3xl font-semibold tracking-[-0.03em]">{m.auth.resetTitle}</h1>
      <p className="mt-2 text-ink-soft">{m.auth.resetSubtitle}</p>
      <Card className="mt-8 p-6 sm:p-7">
        {token ? (
          <ActionForm action={resetPasswordAction} className="space-y-4">
            <input type="hidden" name="token" value={token.slice(0, 200)} />
            <Field label={m.auth.newPassword} hint={m.auth.passwordHint}>
              <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
            </Field>
            <SubmitButton size="lg" className="mt-2 w-full">{m.auth.resetButton}</SubmitButton>
          </ActionForm>
        ) : (
          <p className="text-sm text-danger">{m.auth.resetInvalid}</p>
        )}
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        <Link href="/forgot" className="font-medium text-ink underline underline-offset-4">{m.auth.forgotLink}</Link>
      </p>
    </Container>
  );
}
