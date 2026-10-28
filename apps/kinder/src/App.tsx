import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, SESSION_EXPIRED, type Deck, type User } from './api.ts';
import { Study } from './Study.tsx';

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [deck, setDeck] = useState<Deck | null>(null);

  useEffect(() => {
    api.get<{ user: User }>('/auth/me').then((r) => setUser(r.user.role === 'kind' ? r.user : null), () => setUser(null));
    const expired = () => {
      setUser(null);
      setDeck(null);
    };
    window.addEventListener(SESSION_EXPIRED, expired);
    return () => window.removeEventListener(SESSION_EXPIRED, expired);
  }, []);

  // Zurück-Taste (Android) bzw. Wischgeste schließt den Lernmodus statt die App zu verlassen
  useEffect(() => {
    if (!deck) return;
    history.pushState({ study: true }, '');
    const onPop = () => setDeck(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [deck]);

  const logout = async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
  };

  if (user === undefined) return <div className="screen center"><div className="spinner" /></div>;
  if (user === null) return <Login onLogin={setUser} />;
  if (deck) return <Study deck={deck} onExit={() => history.back()} />;
  return <Home user={user} onOpen={setDeck} onLogout={() => void logout()} />;
}

function Login({ onLogin }: { onLogin: (u: User) => void }) {
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
      if (user.role !== 'kind') {
        await api.post('/auth/logout');
        setError('Betreuer melden sich bitte auf der Betreuer-Seite an.');
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
    <div className="screen login">
      <form className="login-box" onSubmit={submit}>
        <img src="/icon-192.png" alt="" width={88} height={88} className="login-logo" />
        <h1>Karteikarten</h1>
        <p>Melde dich mit deinen Zugangsdaten an.</p>
        {error && <div className="error-box">{error}</div>}
        <div className="text-field">
          <input id="username" placeholder=" " value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
          <label htmlFor="username">Benutzername</label>
        </div>
        <div className="text-field">
          <input id="password" placeholder=" " type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          <label htmlFor="password">Passwort</label>
        </div>
        <button className="btn filled large block" disabled={busy}>{busy ? 'Einen Moment …' : "Los geht's!"}</button>
      </form>
    </div>
  );
}

function Home({ user, onOpen, onLogout }: { user: User; onOpen: (d: Deck) => void; onLogout: () => void }) {
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.get<{ decks: Deck[] }>('/kind/decks').then((r) => setDecks(r.decks), (e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="screen home">
      <header className="home-head">
        <div>
          <div className="hello">Hallo {user.displayName}! 👋</div>
          <div className="sub">Was möchtest du heute lernen?</div>
        </div>
        <button className="btn text" onClick={onLogout}>Abmelden</button>
      </header>

      {error && (
        <div className="error-box">
          {error} <button className="btn text" onClick={load}>Nochmal versuchen</button>
        </div>
      )}
      {!decks && !error && <div className="center pad"><div className="spinner" /></div>}
      {decks?.length === 0 && (
        <div className="empty-box">
          <div className="empty-emoji">📭</div>
          <p>Dir wurden noch keine Karteikarten zugeteilt.<br />Frag deinen Betreuer!</p>
        </div>
      )}

      <div className="deck-list">
        {decks?.map((d) => {
          const p = d.progress;
          const pct = p.totalCards ? Math.round((p.solved / p.totalCards) * 100) : 0;
          return (
            <button key={d.id} className={`deck ${p.status}`} onClick={() => onOpen(d)} disabled={p.totalCards === 0}>
              <div className="deck-top">
                <span className="deck-title">{d.title}</span>
                {p.status === 'abgeschlossen' && <span className="deck-star" aria-label="geschafft">⭐</span>}
              </div>
              {d.description && <div className="deck-desc">{d.description}</div>}
              <div className="deck-bar"><div style={{ width: `${pct}%` }} /></div>
              <div className="deck-meta">
                {p.totalCards === 0 ? 'Noch keine Karten'
                  : p.status === 'neu' ? `${p.totalCards} Karten · Starten`
                  : p.status === 'abgeschlossen' ? `Geschafft! ${p.completions > 1 ? `(${p.completions}×)` : ''} · Nochmal üben`
                  : `${p.solved} von ${p.totalCards} richtig · Runde ${p.round} · Weitermachen`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
