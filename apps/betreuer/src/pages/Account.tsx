import { useState, type FormEvent } from 'react';
import { t } from '../i18n.ts';
import { api, ROLE_LABELS } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { attempt, Field } from '../components/ui.tsx';

export function AccountPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== repeat) {
      setError(t('Die neuen Passwörter stimmen nicht überein.'));
      return;
    }
    setError(null);
    if (await attempt(() => api.post('/auth/password', { currentPassword, newPassword }), t('Passwort geändert. Andere Geräte wurden abgemeldet.'))) {
      setCurrent('');
      setNew('');
      setRepeat('');
    }
  };

  return (
    <div className="page">
      <h1>{t('Mein Konto')}</h1>
      <div className="panel">
        <dl className="details">
          <dt>{t('Name')}</dt><dd dir="auto">{user.displayName}</dd>
          <dt>{t('Benutzername')}</dt><dd className="mono" dir="ltr">{user.username}</dd>
          <dt>{t('Rolle')}</dt><dd>{t(ROLE_LABELS[user.role])}</dd>
        </dl>
      </div>
      <form className="panel narrow" onSubmit={submit}>
        <h2>{t('Passwort ändern')}</h2>
        {error && <div className="alert alert-error">{error}</div>}
        <Field label={t('Aktuelles Passwort')}><input type="password" value={currentPassword} onChange={(e) => setCurrent(e.currentTarget.value)} required autoComplete="current-password" /></Field>
        <Field label={t('Neues Passwort')} hint={t('Mindestens 10 Zeichen. Am besten ein Satz oder mehrere Wörter.')}>
          <input type="password" value={newPassword} onChange={(e) => setNew(e.currentTarget.value)} required minLength={10} autoComplete="new-password" />
        </Field>
        <Field label={t('Neues Passwort wiederholen')}><input type="password" value={repeat} onChange={(e) => setRepeat(e.currentTarget.value)} required autoComplete="new-password" /></Field>
        <div className="form-actions"><button className="btn btn-primary">{t('Passwort ändern')}</button></div>
      </form>
    </div>
  );
}
