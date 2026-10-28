import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ProgressStatus } from '../api.ts';
import { t, tKey } from '../i18n.ts';

// ---------- Daten laden ----------

export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fn = useCallback(load, deps);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fn());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [fn]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload, setData };
}

export function Loading({ error, onRetry }: { error?: string | null; onRetry?: () => void }) {
  if (error) {
    return (
      <div className="alert alert-error">
        {error} {onRetry && <button className="btn btn-small" onClick={onRetry}>{t('Erneut versuchen')}</button>}
      </div>
    );
  }
  return <div className="loading">{t('Lädt …')}</div>;
}

// ---------- Hinweise (Toasts) ----------

type Toast = { id: number; text: string; kind: 'ok' | 'error' };
let pushToast: (t: Omit<Toast, 'id'>) => void = () => {};

export const toast = {
  ok: (text: string) => pushToast({ text, kind: 'ok' }),
  error: (text: string) => pushToast({ text, kind: 'error' }),
};

export function Toasts() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    let next = 1;
    pushToast = (t) => {
      const id = next++;
      setItems((list) => [...list, { ...t, id }]);
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== id)), t.kind === 'error' ? 6000 : 3000);
    };
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>
      ))}
    </div>
  );
}

// ---------- Dialoge ----------

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.querySelector<HTMLElement>('input, textarea, select')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('Schließen')}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

type ConfirmRequest = { message: string; confirmLabel: string; danger: boolean; resolve: (ok: boolean) => void };
let openConfirm: (r: ConfirmRequest) => void = () => {};

/** Sicherheitsabfrage, z. B. vor dem Löschen. */
export function confirmDialog(message: string, opts: { confirmLabel?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => openConfirm({ message, confirmLabel: opts.confirmLabel ?? t('OK'), danger: opts.danger ?? false, resolve }));
}

export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  useEffect(() => {
    openConfirm = setReq;
  }, []);
  if (!req) return null;
  const close = (ok: boolean) => {
    req.resolve(ok);
    setReq(null);
  };
  return (
    <Modal title={t('Bitte bestätigen')} onClose={() => close(false)}>
      <p className="confirm-text">{req.message}</p>
      <div className="form-actions">
        <button className="btn" onClick={() => close(false)}>{t('Abbrechen')}</button>
        <button className={`btn ${req.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)} autoFocus>{req.confirmLabel}</button>
      </div>
    </Modal>
  );
}

// ---------- Kleine Bausteine ----------

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="progress" title={t('{value} von {max}', { value, max })}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

const STATUS_LABEL: Record<ProgressStatus, string> = { neu: tKey('Noch nicht begonnen'), in_arbeit: tKey('In Arbeit'), abgeschlossen: tKey('Abgeschlossen') };

export function StatusBadge({ status }: { status: ProgressStatus }) {
  return <span className={`badge badge-${status}`}>{t(STATUS_LABEL[status])}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

/** Führt eine Aktion aus und zeigt Fehler als Hinweis an. Gibt true bei Erfolg zurück. */
export async function attempt(fn: () => Promise<unknown>, success?: string): Promise<boolean> {
  try {
    await fn();
    if (success) toast.ok(success);
    return true;
  } catch (e) {
    toast.error((e as Error).message);
    return false;
  }
}
