'use client';
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, Link2, PackageX, RefreshCw } from 'lucide-react';
import { removeUnavailableItemAction, replaceUnavailableItemAction } from '@/app/actions/customer';
import { useI18n } from '@/i18n/client';
import { cn } from '@/lib/format';
import { ActionForm, SubmitButton } from './action-form';
import { Button, Field, Input, Textarea } from './ui';

/**
 * Shown on an out-of-stock item until the customer decides: continue without it, or replace it with another
 * product (link or photo). Replacing starts the new item's own life cycle: staff price it and send a new quotation.
 */
export function ItemDecision({ itemId }: { itemId: string }) {
  const { m } = useI18n();
  const d = m.detail.decision;
  const o = m.order;
  const [replacing, setReplacing] = useState(false);
  const [mode, setMode] = useState<'URL' | 'IMAGE'>('URL');

  return (
    <div className="mt-3 rounded-control border border-warn/30 bg-warn-soft p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-warn">
        <PackageX className="size-4" aria-hidden />
        {d.title}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{d.text}</p>

      {!replacing && (
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionForm action={removeUnavailableItemAction}>
            <input type="hidden" name="itemId" value={itemId} />
            <SubmitButton size="sm" variant="secondary">{d.remove}</SubmitButton>
          </ActionForm>
          <Button type="button" size="sm" variant="accent" onClick={() => setReplacing(true)}>
            <RefreshCw className="size-4" aria-hidden />
            {d.replace}
          </Button>
        </div>
      )}

      <AnimatePresence initial={false}>
        {replacing && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <ActionForm action={replaceUnavailableItemAction} className="mt-4 space-y-3">
              <input type="hidden" name="itemId" value={itemId} />
              <input type="hidden" name="method" value={mode} />
              <div role="tablist" className="grid grid-cols-2 rounded-[0.9rem] bg-surface p-1">
                {(['URL', 'IMAGE'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={mode === k}
                    onClick={() => setMode(k)}
                    className={cn('flex h-9 cursor-pointer items-center justify-center gap-2 rounded-[0.7rem] text-[13px] font-medium', mode === k ? 'bg-raised text-ink' : 'text-muted hover:text-ink')}
                  >
                    {k === 'URL' ? <Link2 className="size-4" aria-hidden /> : <Camera className="size-4" aria-hidden />}
                    {k === 'URL' ? o.tabUrl : o.tabImage}
                  </button>
                ))}
              </div>
              {mode === 'URL' ? (
                <>
                  <Field label={o.url}>
                    <Input name="sourceUrl" type="url" inputMode="url" placeholder={o.card.hint} required />
                  </Field>
                  <Field label={o.productTitle}>
                    <Input name="title" placeholder={o.productTitlePh} maxLength={300} required minLength={2} />
                  </Field>
                </>
              ) : (
                <>
                  <Field label={o.images}>
                    <input name="images" type="file" accept="image/jpeg,image/png,image/webp" multiple required className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-full file:border-0 file:bg-raised file:px-3 file:py-2 file:text-ink" />
                  </Field>
                  <Field label={o.description}>
                    <Textarea name="description" placeholder={o.descriptionPh} maxLength={2000} required minLength={3} />
                  </Field>
                </>
              )}
              <div className="grid grid-cols-[1fr_6rem] gap-3">
                <Field label={o.sizeColor} optional={m.common.optional}>
                  <Input name="sizeColor" placeholder={o.sizeColorPh} maxLength={200} />
                </Field>
                <Field label={o.quantity}>
                  <Input name="quantity" type="number" min={1} max={10000} defaultValue={1} required />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <SubmitButton size="sm" variant="accent">{d.submit}</SubmitButton>
                <Button type="button" size="sm" variant="ghost" onClick={() => setReplacing(false)}>{d.cancel}</Button>
              </div>
            </ActionForm>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
