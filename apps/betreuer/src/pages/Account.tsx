import { useState, type FormEvent } from 'react';
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
      setError('Die neuen Passwörter stimmen nicht überein.');
      return;
    }
    setError(null);
    if (await attempt(() => api.post('/auth/password', { currentPassword, newPassword }), 'Passwort geändert. Andere Geräte wurden abgemeldet.')) {
      setCurrent('');
      setNew('');
      setRepeat('');
    }
  };

  return (
    <div className="page">
      <h1>Mein Konto</h1>
      <div className="panel">
        <dl className="details">
          <dt>Name</dt><dd>{user.displayName}</dd>
          <dt>Benutzername</dt><dd className="mono">{user.username}</dd>
          <dt>Rolle</dt><dd>{ROLE_LABELS[user.role]}</dd>
        </dl>
      </div>
      <form className="panel narrow" onSubmit={submit}>
        <h2>Passwort ändern</h2>
        {error && <div className="alert alert-error">{error}</div>}
        <Field label="Aktuelles Passwort"><input type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" /></Field>
        <Field label="Neues Passwort" hint="Mindestens 10 Zeichen. Am besten ein Satz oder mehrere Wörter.">
          <input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} required minLength={10} autoComplete="new-password" />
        </Field>
        <Field label="Neues Passwort wiederholen"><input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required autoComplete="new-password" /></Field>
        <div className="form-actions"><button className="btn btn-primary">Passwort ändern</button></div>
      </form>
    </div>
  );
}
