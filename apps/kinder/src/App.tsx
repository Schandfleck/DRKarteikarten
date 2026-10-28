import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, SESSION_EXPIRED, staffTarget, type Deck, type User } from './api.ts';
import { t, useLanguage } from './i18n.ts';
import { applyAccountLanguage, SettingsDialog } from './Settings.tsx';
import { Study } from './Study.tsx';

/*
 * "Angemeldet bleiben" aus: Die Wahl merkt sich localStorage, sessionStorage markiert die laufende App-Sitzung.
 * sessionStorage wird beim Schließen der App/des Tabs geleert → beim nächsten Öffnen wird abgemeldet.
 * Zusätzlich läuft eine solche Anmeldung auf dem Server nach spätestens 2 Stunden ab.
 */
const REMEMBER_KEY = 'kk-remember';
const SESSION_MARK = 'kk-session-active';

function storageGet(store: Storage, key: string): string | null {
  try { return store.getItem(key); } catch { return null; }
}
function storageSet(store: Storage, key: string, value: string): void {
  try { store.setItem(key, value); } catch { /* privater Modus o. Ä. */ }
}

export function App() {
  useLanguage(); // bei Sprachwechsel alles neu zeichnen
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deck, setDeck] = useState<Deck | null>(null);

  useEffect(() => {
    const reopenedWithoutRemember = storageGet(localStorage, REMEMBER_KEY) === '0' && !storageGet(sessionStorage, SESSION_MARK);
    if (reopenedWithoutRemember) {
      void api.post('/auth/logout').catch(() => {}).finally(() => setUser(null));
    } else {
      // Kind angemeldet → App zeigen; sonst ein angemeldeter Betreuer → weiter zur Betreuer-Seite; sonst Anmeldeseite
      api.get<{ user: User }>('/auth/me').then(
        (r) => {
          applyAccountLanguage(r.user);
          setUser(r.user);
        },
        () => api.staffMe().then(() => window.location.replace(staffTarget()), () => setUser(null)),
      );
    }
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

  const openSettings = () => setSettingsOpen(true);
  let screen;
  if (user === undefined) screen = <div className="screen center"><div className="spinner" /></div>;
  else if (user === null) screen = <Login onLogin={setUser} onSettings={openSettings} />;
  else if (deck) screen = <Study deck={deck} onExit={() => history.back()} />;
  else screen = <Home user={user} onOpen={setDeck} onLogout={() => void logout()} onSettings={openSettings} />;
  return (
    <>
      {screen}
      {settingsOpen && <SettingsDialog loggedIn={!!user} onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

function SettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="icon-button" onClick={onClick} aria-label={t('Einstellungen')} title={t('Einstellungen')}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94a7.07 7.07 0 0 0 .05-.94 7.07 7.07 0 0 0-.05-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.48.41l-.36 2.54a7.36 7.36 0 0 0-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58a7.4 7.4 0 0 0 0 1.88l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54c.05.24.25.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54a7.36 7.36 0 0 0 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z" /></svg>
    </button>
  );
}

function Login({ onLogin, onSettings }: { onLogin: (u: User) => void; onSettings: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => storageGet(localStorage, REMEMBER_KEY) === '1');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Gemeinsame Anmeldeseite: Der Server erkennt am Konto, ob Kind oder Betreuer
      const { user } = await api.post<{ user: User }>('/auth/login', { username, password, remember });
      if (user.role !== 'kind') {
        window.location.assign(staffTarget());
        return;
      }
      if (window.location.search) history.replaceState(null, '', '/');
      applyAccountLanguage(user);
      storageSet(localStorage, REMEMBER_KEY, remember ? '1' : '0');
      storageSet(sessionStorage, SESSION_MARK, '1');
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
        <div className="login-settings"><SettingsButton onClick={onSettings} /></div>
        <img src="/icon.svg" alt="" width={88} height={88} className="login-logo" />
        <h1>{t('Karteikarten')}</h1>
        <p>{t('Melde dich mit deinen Zugangsdaten an.')}</p>
        {error && <div className="error-box">{error}</div>}
        <div className="text-field">
          <input id="username" placeholder=" " value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
          <label htmlFor="username">{t('Benutzername')}</label>
        </div>
        <div className="text-field">
          <input id="password" placeholder=" " type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          <label htmlFor="password">{t('Passwort')}</label>
        </div>
        <label className="remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>
            {t('Angemeldet bleiben')}
            <small>{t('Nur auf deinem eigenen Gerät anhaken.')}</small>
          </span>
        </label>
        <button className="btn filled large block" disabled={busy}>{busy ? t('Einen Moment …') : t("Los geht's!")}</button>
        <a className="legal-link" href="/lizenzen.txt" target="_blank" rel="noopener">{t('Lizenzen')}</a>
      </form>
    </div>
  );
}

function Home({ user, onOpen, onLogout, onSettings }: { user: User; onOpen: (d: Deck) => void; onLogout: () => void; onSettings: () => void }) {
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
          <div className="hello">{t('Hallo {name}!', { name: user.displayName })} 👋</div>
          <div className="sub">{t('Was möchtest du heute lernen?')}</div>
        </div>
        <div className="home-actions">
          <SettingsButton onClick={onSettings} />
          <button className="btn text" onClick={onLogout}>{t('Abmelden')}</button>
        </div>
      </header>

      {error && (
        <div className="error-box">
          {error} <button className="btn text" onClick={load}>{t('Nochmal versuchen')}</button>
        </div>
      )}
      {!decks && !error && <div className="center pad"><div className="spinner" /></div>}
      {decks?.length === 0 && (
        <div className="empty-box">
          <div className="empty-emoji">📭</div>
          <p>{t('Dir wurden noch keine Karteikarten zugeteilt.')}<br />{t('Frag deinen Betreuer!')}</p>
        </div>
      )}

      <div className="deck-list">
        {decks?.map((d) => {
          const p = d.progress;
          const pct = p.totalCards ? Math.round((p.solved / p.totalCards) * 100) : 0;
          return (
            <button key={d.id} className={`deck ${p.status}`} onClick={() => onOpen(d)} disabled={p.totalCards === 0}>
              <div className="deck-top">
                <span className="deck-title" dir="auto">{d.title}</span>
                {p.status === 'abgeschlossen' && <span className="deck-star" aria-label={t('geschafft')}>⭐</span>}
              </div>
              {d.description && <div className="deck-desc" dir="auto">{d.description}</div>}
              <div className="deck-bar"><div style={{ width: `${pct}%` }} /></div>
              <div className="deck-meta">
                {p.totalCards === 0 ? t('Noch keine Karten')
                  : p.status === 'neu' ? t('{n} Karten · Starten', { n: p.totalCards })
                  : p.status === 'abgeschlossen' ? `${p.completions > 1 ? t('Geschafft! ({n}×)', { n: p.completions }) : t('Geschafft!')} · ${t('Nochmal üben')}`
                  : t('{solved} von {total} richtig · Runde {round} · Weitermachen', { solved: p.solved, total: p.totalCards, round: p.round })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
