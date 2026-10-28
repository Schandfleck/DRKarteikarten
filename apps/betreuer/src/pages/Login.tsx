import { useState, type FormEvent } from 'react';
import { api, type User } from '../api.ts';

export function LoginPage({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.post<{ user: User }>('/auth/login', { username, password });
      if (user.role === 'kind') {
        await api.post('/auth/logout');
        setError('Das ist ein Kinderkonto. Kinder melden sich in der Kinder-App an.');
        return;
      }
      onLogin(user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <img src="/betreuer/icon.svg" alt="" width={56} height={56} />
        <h1>Karteikarten</h1>
        <p className="muted">Anmeldung für Betreuer</p>
        {error && <div className="alert alert-error">{error}</div>}
        <label className="field">
          <span className="field-label">Benutzername</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required autoFocus />
        </label>
        <label className="field">
          <span className="field-label">Passwort</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Anmelden …' : 'Anmelden'}</button>
        <p className="muted small">Passwort vergessen? Bitte an einen Admin wenden.</p>
      </form>
    </div>
  );
}
