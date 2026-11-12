'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Camera, Check, ImagePlus, Info, Link2, X } from 'lucide-react';
import { useI18n } from '@/i18n/client';
import { cn, fmt } from '@/lib/format';
import { detectMarketplace, parseHttpUrl, type MarketplaceInfo } from '@/lib/marketplaces';
import { Badge, Button, buttonClass, Card, Field, Input, Select, Textarea } from './ui';

const MAX_FILES = 6;
const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];

type Mode = 'URL' | 'IMAGE';
type FormValues = {
  sourceUrl: string;
  productTitle: string;
  variant: string;
  description: string;
  sizeColor: string;
  quantity: number;
  instructions: string;
  regionKey: string;
};
type Picked = { file: File; preview: string };

export function OrderForm({
  marketplaces,
  regions,
  initialUrl,
  initialMode,
}: {
  marketplaces: MarketplaceInfo[];
  regions: { key: string; name: string }[];
  initialUrl: string;
  initialMode: Mode;
}) {
  const { m } = useI18n();
  const o = m.order;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [images, setImages] = useState<Picked[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState<{ id: string; number: string } | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Client-side validation is for convenience only; the API validates everything again.
  const schema = useMemo(() => {
    const base = {
      variant: z.string().max(200),
      sizeColor: z.string().max(200),
      quantity: z.number({ error: m.common.invalid }).int().min(1).max(10_000),
      instructions: z.string().max(2000),
      regionKey: z.string(),
    };
    return mode === 'URL'
      ? z.object({
          ...base,
          sourceUrl: z.string().refine((v) => parseHttpUrl(v) !== null, o.invalidUrl),
          productTitle: z.string().trim().min(2, o.needTitle).max(300),
          description: z.string(),
        })
      : z.object({
          ...base,
          sourceUrl: z.string(),
          productTitle: z.string(),
          description: z.string().trim().min(3, o.needDescription).max(2000),
        });
  }, [mode, m, o]);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { sourceUrl: initialUrl, productTitle: '', variant: '', description: '', sizeColor: '', quantity: 1, instructions: '', regionKey: '' },
  });

  const url = watch('sourceUrl');
  const validUrl = parseHttpUrl(url ?? '') !== null;
  const detected = validUrl ? detectMarketplace(url, marketplaces) : null;

  useEffect(() => () => images.forEach((i) => URL.revokeObjectURL(i.preview)), []); // eslint-disable-line react-hooks/exhaustive-deps

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    setFileError(null);
    const next = [...images];
    for (const file of Array.from(list)) {
      if (!ACCEPT.includes(file.type)) {
        setFileError(o.fileType);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setFileError(o.fileSize);
        continue;
      }
      if (next.length >= MAX_FILES) {
        setFileError(o.tooMany);
        break;
      }
      next.push({ file, preview: URL.createObjectURL(file) });
    }
    setImages(next);
  }

  function removeImage(index: number) {
    URL.revokeObjectURL(images[index].preview);
    setImages(images.filter((_, i) => i !== index));
  }

  async function onSubmit(values: FormValues) {
    setServerError(null);
    if (mode === 'IMAGE' && images.length === 0) {
      setFileError(o.needImage);
      return;
    }
    const body = new FormData();
    body.set('method', mode);
    body.set('quantity', String(values.quantity));
    body.set('sizeColor', values.sizeColor);
    body.set('instructions', values.instructions);
    body.set('regionKey', detected ? '' : values.regionKey);
    if (mode === 'URL') {
      body.set('sourceUrl', values.sourceUrl.trim());
      body.set('productTitle', values.productTitle);
      body.set('variant', values.variant);
    } else {
      body.set('description', values.description);
      images.forEach((i) => body.append('images', i.file));
    }

    try {
      const res = await fetch('/api/orders', { method: 'POST', body });
      const json = (await res.json().catch(() => ({}))) as { id?: string; number?: string; error?: string };
      if (!res.ok || !json.id || !json.number) {
        const map: Record<string, string> = { file_type: o.fileType, file_size: o.fileSize, too_many: o.tooMany, no_image: o.needImage, rate: m.auth.rate, invalid: m.common.invalid };
        setServerError(map[json.error ?? ''] ?? m.common.error);
        return;
      }
      images.forEach((i) => URL.revokeObjectURL(i.preview));
      setImages([]);
      reset();
      setDone({ id: json.id, number: json.number });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setServerError(m.common.error);
    }
  }

  if (done) {
    return (
      <Card className="p-8 text-center sm:p-12">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-white">
          <Check className="size-6" aria-hidden />
        </div>
        <h2 className="mt-6 text-2xl font-semibold">{o.successTitle}</h2>
        <p className="mx-auto mt-3 max-w-md leading-relaxed text-ink-soft">{fmt(o.successText, { number: done.number })}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href={`/dashboard/orders/${done.id}`} className={buttonClass('primary', 'lg')}>
            {o.viewOrder}
          </Link>
          <Button variant="secondary" size="lg" onClick={() => setDone(null)}>
            {o.another}
          </Button>
        </div>
      </Card>
    );
  }

  const tabs: { key: Mode; label: string; icon: typeof Link2 }[] = [
    { key: 'URL', label: o.tabUrl, icon: Link2 },
    { key: 'IMAGE', label: o.tabImage, icon: Camera },
  ];

  return (
    <Card className="overflow-hidden">
      <div role="tablist" className="grid grid-cols-2 border-b border-line bg-paper/60 p-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={mode === t.key}
            onClick={() => {
              setMode(t.key);
              setServerError(null);
              setFileError(null);
            }}
            className={cn(
              'flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[0.9rem] text-sm font-medium transition-colors',
              mode === t.key ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
            )}
          >
            <t.icon className="size-4" aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5 p-5 sm:p-7">
        {mode === 'URL' ? (
          <>
            <Field label={o.url} error={errors.sourceUrl?.message}>
              <Input type="url" inputMode="url" placeholder={o.urlPlaceholder} autoComplete="off" aria-invalid={!!errors.sourceUrl} {...register('sourceUrl')} />
            </Field>
            {validUrl && (
              <div className="-mt-2 space-y-3">
                {detected ? (
                  <Badge tone="accent">
                    <Check className="size-3.5" aria-hidden />
                    {fmt(o.detected, { name: detected.name })}
                  </Badge>
                ) : (
                  <>
                    <p className="text-[13px] text-muted">{o.notDetected}</p>
                    <Field label={o.region} optional={m.common.optional}>
                      <Select {...register('regionKey')}>
                        <option value="">{o.regionUnknown}</option>
                        {regions.map((r) => (
                          <option key={r.key} value={r.key}>
                            {r.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </>
                )}
              </div>
            )}
            <p className="flex gap-2.5 rounded-control bg-paper px-3.5 py-3 text-[13px] leading-relaxed text-ink-soft">
              <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              {o.noAuto}
            </p>
            <Field label={o.productTitle} error={errors.productTitle?.message}>
              <Input placeholder={o.productTitlePh} aria-invalid={!!errors.productTitle} {...register('productTitle')} />
            </Field>
            <Field label={o.variant} optional={m.common.optional}>
              <Input placeholder={o.variantPh} {...register('variant')} />
            </Field>
          </>
        ) : (
          <>
            <div>
              <p className="mb-1.5 text-[13px] font-medium text-ink-soft">{o.images}</p>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  addFiles(e.dataTransfer.files);
                }}
                className={cn(
                  'rounded-card border border-dashed px-5 py-8 text-center transition-colors',
                  dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-paper/50',
                )}
              >
                <ImagePlus className="mx-auto size-6 text-muted" strokeWidth={1.5} aria-hidden />
                <p className="mt-3 text-sm font-medium">{o.drop}</p>
                <p className="mt-1 text-[13px] text-muted">{o.dropHint}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => galleryRef.current?.click()}>
                    <ImagePlus className="size-4" aria-hidden />
                    {o.images}
                  </Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => cameraRef.current?.click()}>
                    <Camera className="size-4" aria-hidden />
                    {o.camera}
                  </Button>
                </div>
                <input ref={galleryRef} type="file" accept={ACCEPT.join(',')} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
              </div>
              {fileError && <p className="mt-2 text-[13px] text-danger">{fileError}</p>}
              {images.length > 0 && (
                <ul className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-6">
                  {images.map((img, i) => (
                    <li key={img.preview} className="group relative aspect-square overflow-hidden rounded-control border border-line bg-paper">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.preview} alt="" className="size-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        aria-label={m.common.remove}
                        className="absolute top-1 right-1 flex size-6 cursor-pointer items-center justify-center rounded-full bg-ink/80 text-white"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Field label={o.description} error={errors.description?.message}>
              <Textarea placeholder={o.descriptionPh} aria-invalid={!!errors.description} {...register('description')} />
            </Field>
          </>
        )}

        <div className="grid grid-cols-[1fr_7rem] gap-4">
          <Field label={o.sizeColor} optional={m.common.optional}>
            <Input placeholder={o.sizeColorPh} {...register('sizeColor')} />
          </Field>
          <Field label={o.quantity} error={errors.quantity?.message}>
            <Input type="number" inputMode="numeric" min={1} max={10000} aria-invalid={!!errors.quantity} {...register('quantity', { valueAsNumber: true })} />
          </Field>
        </div>
        <Field label={o.instructions} optional={m.common.optional}>
          <Textarea placeholder={o.instructionsPh} {...register('instructions')} />
        </Field>

        {serverError && (
          <p role="alert" className="rounded-control bg-danger-soft px-3.5 py-3 text-sm text-danger">
            {serverError}
          </p>
        )}

        <div className="flex flex-col-reverse items-stretch gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-center text-[13px] text-muted sm:text-left">{o.free}</p>
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {isSubmitting ? o.submitting : o.submit}
          </Button>
        </div>
      </form>
    </Card>
  );
}
