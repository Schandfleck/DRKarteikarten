import { useEffect } from 'react';
import { api, type User } from './api.ts';
import { getLanguage, LANGUAGES, setLanguage, t, type Language } from './i18n.ts';

/**
 * Übernimmt nach der Anmeldung die Sprache des Kontos.
 * Hat das Konto noch keine, wird die auf dem Gerät gewählte Sprache ins Konto gespeichert.
 */
export function applyAccountLanguage(user: User): void {
  if (user.language) setLanguage(user.language);
  else if (getLanguage() !== 'de') void api.put('/auth/language', { language: getLanguage() }).catch(() => {});
}

/** Einstellungen-Fenster (MD3-Dialog). Angemeldet: Sprache wird im Konto gespeichert, sonst nur auf dem Gerät. */
export function SettingsDialog({ loggedIn, onClose }: { loggedIn: boolean; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const choose = (lang: Language) => {
    setLanguage(lang);
    if (loggedIn) void api.put('/auth/language', { language: lang }).catch(() => {});
  };

  return (
    <div className="dialog-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <h2 id="settings-title">{t('Einstellungen')}</h2>
        <div className="dialog-section" role="radiogroup" aria-label={t('Sprache')}>
          <div className="dialog-label">{t('Sprache')}</div>
          {LANGUAGES.map((l) => (
            <label key={l.code} className="radio-row" lang={l.code} dir="auto">
              <input type="radio" name="language" checked={getLanguage() === l.code} onChange={() => choose(l.code)} />
              <span>{l.name}</span>
            </label>
          ))}
          <p className="dialog-hint">
            {loggedIn
              ? t('Die Sprache wird für dein Konto gespeichert und gilt auf allen Geräten.')
              : t('Die Sprache gilt für dieses Gerät. Nach der Anmeldung wird sie in deinem Konto gespeichert.')}
          </p>
        </div>
        <div className="dialog-actions">
          <button className="btn text" onClick={onClose} autoFocus>{t('Schließen')}</button>
        </div>
      </div>
    </div>
  );
}
