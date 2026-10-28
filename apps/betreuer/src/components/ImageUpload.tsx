import { useRef, useState } from 'react';
import { api, imageUrl } from '../api.ts';
import { t } from '../i18n.ts';
import { toast } from './ui.tsx';

const MAX_SIDE = 1600;

/** Große Handyfotos werden vor dem Hochladen verkleinert (spart Speicher und Ladezeit in der App). */
async function shrink(file: File): Promise<Blob> {
  if (file.type === 'image/gif' || file.size < 400_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export function ImageUpload({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const blob = await shrink(file);
      if (blob.size > 5 * 1024 * 1024) throw new Error(t('Das Bild ist zu groß (max. 5 MB).'));
      const { id } = await api.upload(new File([blob], file.name, { type: blob.type || file.type }));
      onChange(id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="image-upload">
      {value ? (
        <div className="image-preview">
          <img src={imageUrl(value)} alt="" />
          <button type="button" className="btn btn-small" onClick={() => onChange(null)}>{t('Bild entfernen')}</button>
        </div>
      ) : (
        <button type="button" className="btn btn-dashed" onClick={() => input.current?.click()} disabled={busy}>
          {busy ? t('Lädt hoch …') : t('+ Bild hinzufügen')}
        </button>
      )}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => void pick(e.target.files?.[0])} />
    </div>
  );
}
