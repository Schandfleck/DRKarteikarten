import { useCallback, useEffect, useState } from 'react';
import { api, ROLE_LABELS, SESSION_EXPIRED, type User } from './api.ts';
import { AuthContext } from './auth.tsx';
import { ConfirmHost, Toasts } from './components/ui.tsx';
import { AccountPage } from './pages/Account.tsx';
import { AuditPage } from './pages/Audit.tsx';
import { ChildDetailPage } from './pages/ChildDetail.tsx';
import { ChildrenPage } from './pages/Children.tsx';
import { DashboardPage } from './pages/Dashboard.tsx';
import { DeckDetailPage } from './pages/DeckDetail.tsx';
import { DecksPage } from './pages/Decks.tsx';
import { LoginPage } from './pages/Login.tsx';
import { StaffPage } from './pages/Staff.tsx';
import { Link, navigate, usePath } from './router.tsx';

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
      <h1>Seite nicht gefunden</h1>
      <p><Link to="/">Zur Übersicht</Link></p>
    </div>
  );
}

function NavItem({ to, label, path }: { to: string; label: string; path: string }) {
  const active = to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`);
  return <Link to={to} className={`nav-item ${active ? 'active' : ''}`}>{label}</Link>;
}

export function App() {
  const path = usePath();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);

  const refresh = useCallback(() => {
    api.get<{ user: User }>('/auth/me').then((r) => setUser(r.user.role === 'kind' ? null : r.user), () => setUser(null));
  }, []);

  useEffect(() => {
    refresh();
    const expired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED, expired);
    return () => window.removeEventListener(SESSION_EXPIRED, expired);
  }, [refresh]);

  useEffect(() => setMenuOpen(false), [path]);

  const logout = useCallback(() => {
    void api.post('/auth/logout').finally(() => {
      setUser(null);
      navigate('/');
    });
  }, []);

  if (user === undefined) return <div className="loading full">Lädt …</div>;
  if (user === null) {
    return (
      <>
        <LoginPage onLogin={setUser} />
        <Toasts />
      </>
    );
  }

  return (
    <AuthContext.Provider value={{ user, logout, refresh }}>
      <div className="shell">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menü">☰</button>
          <Link to="/" className="brand">
            <img src="/betreuer/icon.svg" alt="" width={28} height={28} />
            <span>Karteikarten</span>
          </Link>
        </header>
        <nav className={`sidebar ${menuOpen ? 'open' : ''}`}>
          <Link to="/" className="brand brand-side">
            <img src="/betreuer/icon.svg" alt="" width={32} height={32} />
            <span>Karteikarten<small>Betreuer-Bereich</small></span>
          </Link>
          <NavItem to="/" label="Übersicht" path={path} />
          <NavItem to="/kinder" label="Kinder" path={path} />
          <NavItem to="/stapel" label="Kartenstapel" path={path} />
          {user.role === 'admin' && (
            <>
              <div className="nav-section">Verwaltung</div>
              <NavItem to="/betreuer" label="Betreuer" path={path} />
              <NavItem to="/protokoll" label="Protokoll" path={path} />
            </>
          )}
          <div className="nav-spacer" />
          <div className="nav-user">
            <div className="nav-user-name">{user.displayName}</div>
            <div className="nav-user-role">{ROLE_LABELS[user.role]}</div>
          </div>
          <NavItem to="/konto" label="Mein Konto" path={path} />
          <button className="nav-item nav-logout" onClick={logout}>Abmelden</button>
        </nav>
        {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
        <main className="main">
          <Page path={path} user={user} />
        </main>
      </div>
      <Toasts />
      <ConfirmHost />
    </AuthContext.Provider>
  );
}
