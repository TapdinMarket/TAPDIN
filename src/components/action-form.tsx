'use client';
import { useActionState, useEffect, useRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/format';
import { Button } from './ui';

export type ActionState = { ok: boolean; message?: string } | null;
export type FormAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Thin wrapper around a server action: shows the returned message and
 * optionally resets the form after success. All validation happens on the server.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state?.message && (
        <p role="status" className={cn('mt-3 text-[13px]', state.ok ? 'text-accent' : 'text-danger')}>
          {state.message}
        </p>
      )}
    </form>
  );
}

export function SubmitButton({
  children,
  ...props
}: Omit<React.ComponentProps<typeof Button>, 'type'>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </Button>
  );
}
