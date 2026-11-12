'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from './ui';

export function MediaUploader({ orderId, labels }: { orderId: string; labels: { upload: string; uploading: string; hint: string; failed: string } }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(false);
    const body = new FormData();
    Array.from(files).forEach((f) => body.append('files', f));
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/media`, { method: 'POST', body });
      if (!res.ok) setError(true);
      else router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div>
      <input ref={input} type="file" multiple hidden accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" onChange={(e) => upload(e.target.files)} />
      <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>
        <Upload className="size-4" aria-hidden />
        {busy ? labels.uploading : labels.upload}
      </Button>
      <p className="mt-2 text-[12px] text-muted">{labels.hint}</p>
      {error && <p className="mt-1 text-[13px] text-danger">{labels.failed}</p>}
    </div>
  );
}
