import { api, type User } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { getLanguage, LANGUAGES, setLanguage, t, type Language } from '../i18n.ts';
import { Modal, toast } from './ui.tsx';

/** Einstellungen-Fenster. Die Sprache wird im eigenen Konto gespeichert und gilt auf allen Geräten. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { refresh } = useAuth();
  const choose = async (lang: Language) => {
    setLanguage(lang);
    try {
      await api.put<{ user: User }>('/auth/language', { language: lang });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <Modal title={t('Einstellungen')} onClose={onClose}>
      <div role="radiogroup" aria-label={t('Sprache')}>
        <div className="field-label">{t('Sprache')}</div>
        {LANGUAGES.map((l) => (
          <label key={l.code} className="radio-row" lang={l.code} dir="auto">
            <input type="radio" name="language" checked={getLanguage() === l.code} onChange={() => void choose(l.code)} />
            <span>{l.name}</span>
          </label>
        ))}
        <p className="muted small">{t('Die Sprache wird für dein Konto gespeichert und gilt auf allen Geräten.')}</p>
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" onClick={onClose}>{t('Schließen')}</button>
      </div>
    </Modal>
  );
}
