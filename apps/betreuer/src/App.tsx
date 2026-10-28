import { useCallback, useEffect, useState } from 'react';
import { api, ROLE_LABELS, SESSION_EXPIRED, type User } from './api.ts';
import { AuthContext } from './auth.tsx';
import { SettingsDialog } from './components/Settings.tsx';
import { setLanguage, t, useLanguage } from './i18n.ts';
import { ConfirmHost, Toasts } from './components/ui.tsx';
import { AccountPage } from './pages/Account.tsx';
import { AuditPage } from './pages/Audit.tsx';
import { ChildDetailPage } from './pages/ChildDetail.tsx';
import { ChildrenPage } from './pages/Children.tsx';
import { DashboardPage } from './pages/Dashboard.tsx';
import { DeckDetailPage } from './pages/DeckDetail.tsx';
import { DecksPage } from './pages/Decks.tsx';
import { StaffPage } from './pages/Staff.tsx';
import { Link, usePath } from './router.tsx';

function Page({ path, user }: { path: string; user: User }) {
  let m: RegExpMatchArray | null;
  if (path === '/') return <DashboardPage />;
  if (path === '/kinder') return <ChildrenPage />;
  if ((m = path.match(/^\/kinder\/(\d+)$/))) return <ChildDetailPage id={Number(m[1])} />;
  if (path === '/stapel') return <DecksPage />;
  if ((m = path.match(/^\/stapel\/(\d+)$/))) return <DeckDetailPage id={Number(m[1])} />;
  if (path === '/konto') return <AccountPage />;
  if (path === '/betreuer' && user.role === 'admin') return <StaffPage />;
  if (path === '/protokoll' && user.role === 'admin') return <AuditPage />;
  return (
    <div className="page">
      <h1>{t('Seite nicht gefunden')}</h1>
      <p><Link to="/">{t('Zur Übersicht')}</Link></p>
    </div>
  );
}

function NavItem({ to, label, path }: { to: string; label: string; path: string }) {
  const active = to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`);
  return <Link to={to} className={`nav-item ${active ? 'active' : ''}`}>{label}</Link>;
}

export function App() {
  useLanguage(); // bei Sprachwechsel alles neu zeichnen
  const path = usePath();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);

  const refresh = useCallback(() => {
    api.get<{ user: User }>('/auth/me').then((r) => {
      if (r.user.language) setLanguage(r.user.language);
      setUser(r.user.role === 'kind' ? null : r.user);
    }, () => setUser(null));
  }, []);

  useEffect(() => {
    refresh();
    const expired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED, expired);
    return () => window.removeEventListener(SESSION_EXPIRED, expired);
  }, [refresh]);

  useEffect(() => setMenuOpen(false), [path]);

  const logout = useCallback(() => {
    void api.post('/auth/logout').finally(() => window.location.assign('/'));
  }, []);

  // Nicht angemeldet → gemeinsame Anmeldeseite; danach geht es zur ursprünglich aufgerufenen Seite zurück
  useEffect(() => {
    if (user === null) window.location.replace(`/?weiter=${encodeURIComponent(window.location.pathname)}`);
  }, [user]);

  if (!user) return <div className="loading full">{t('Lädt …')}</div>;

  return (
    <AuthContext.Provider value={{ user, logout, refresh }}>
      <div className="shell">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label={t('Menü')}>☰</button>
          <Link to="/" className="brand">
            <img src="/betreuer/icon.svg" alt="" width={28} height={28} />
            <span>{t('Karteikarten')}</span>
          </Link>
        </header>
        <nav className={`sidebar ${menuOpen ? 'open' : ''}`}>
          <Link to="/" className="brand brand-side">
            <img src="/betreuer/icon.svg" alt="" width={32} height={32} />
            <span>{t('Karteikarten')}<small>{t('Betreuer-Bereich')}</small></span>
          </Link>
          <NavItem to="/" label={t('Übersicht')} path={path} />
          <NavItem to="/kinder" label={t('Kinder')} path={path} />
          <NavItem to="/stapel" label={t('Kartenstapel')} path={path} />
          {user.role === 'admin' && (
            <>
              <div className="nav-section">{t('Verwaltung')}</div>
              <NavItem to="/betreuer" label={t('Betreuer')} path={path} />
              <NavItem to="/protokoll" label={t('Protokoll')} path={path} />
            </>
          )}
          <div className="nav-spacer" />
          <div className="nav-user">
            <div className="nav-user-name">{user.displayName}</div>
            <div className="nav-user-role">{t(ROLE_LABELS[user.role])}</div>
          </div>
          <NavItem to="/konto" label={t('Mein Konto')} path={path} />
          <button className="nav-item" onClick={() => setSettingsOpen(true)}>{t('Einstellungen')}</button>
          <button className="nav-item nav-logout" onClick={logout}>{t('Abmelden')}</button>
          <a className="nav-legal" href="/betreuer/lizenzen.txt" target="_blank" rel="noopener">{t('Lizenzen')}</a>
        </nav>
        {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
        <main className="main">
          <Page path={path} user={user} />
        </main>
      </div>
      <Toasts />
      <ConfirmHost />
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </AuthContext.Provider>
  );
}
