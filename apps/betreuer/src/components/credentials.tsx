import { useState } from 'react';
import { api } from '../api.ts';
import { t } from '../i18n.ts';
import { Modal, toast } from './ui.tsx';

/** Passwortfeld mit "Vorschlag erzeugen" (für Kinder gut merkbare Passwörter) und Anzeigen/Verbergen. */
export function PasswordInput({ value, onChange, forChild, minLength }: { value: string; onChange: (v: string) => void; forChild?: boolean; minLength: number }) {
  const [visible, setVisible] = useState(!!forChild);
  const suggest = async () => {
    if (forChild) {
      const { password } = await api.get<{ password: string }>('/children/password-suggestion');
      onChange(password);
    } else {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
      const bytes = crypto.getRandomValues(new Uint8Array(14));
      onChange(Array.from(bytes, (b) => chars[b % chars.length]).join(''));
      setVisible(true);
    }
  };
  return (
    <div className="input-group">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        minLength={minLength}
        required
        autoComplete="new-password"
        spellCheck={false}
      />
      <button type="button" className="btn" onClick={() => setVisible(!visible)}>{visible ? t('Verbergen') : t('Anzeigen')}</button>
      <button type="button" className="btn" onClick={() => void suggest()}>{t('Vorschlag')}</button>
    </div>
  );
}

/**
 * Zeigt die Zugangsdaten EINMALIG an. Danach ist das Passwort nur noch als Hash gespeichert
 * und kann von niemandem mehr ausgelesen werden – nur neu gesetzt.
 */
export function CredentialsModal({ name, username, password, onClose }: { name: string; username: string; password: string; onClose: () => void }) {
  const copy = async () => {
    await navigator.clipboard.writeText(`${t('Benutzername')}: ${username}\n${t('Passwort')}: ${password}`);
    toast.ok(t('Zugangsdaten kopiert'));
  };
  return (
    <Modal title={t('Zugangsdaten')} onClose={onClose}>
      <div className="alert alert-info">
        <strong>{t('Das Passwort wird nur jetzt einmal angezeigt.')}</strong> {t('Es wird verschlüsselt (als Hash) gespeichert und kann später nicht mehr angezeigt, sondern nur neu vergeben werden.')}
      </div>
      <div className="print-area credentials-card">
        <div className="credentials-title">{t('Zugang zur Karteikarten-App')}</div>
        <div className="credentials-name" dir="auto">{name}</div>
        <dl>
          <dt>{t('Adresse')}</dt>
          <dd dir="ltr">{window.location.origin}/</dd>
          <dt>{t('Benutzername')}</dt>
          <dd className="mono" dir="ltr">{username}</dd>
          <dt>{t('Passwort')}</dt>
          <dd className="mono" dir="ltr">{password}</dd>
        </dl>
      </div>
      <div className="form-actions">
        <button className="btn" onClick={() => void copy()}>{t('Kopieren')}</button>
        <button className="btn" onClick={() => window.print()}>{t('Drucken')}</button>
        <button className="btn btn-primary" onClick={onClose}>{t('Fertig')}</button>
      </div>
    </Modal>
  );
}
