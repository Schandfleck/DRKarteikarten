import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';

// Minimaler Router für die Betreuer-Website (alle Seiten liegen unter /betreuer/...)
const BASE = '/betreuer';
const NAV_EVENT = 'kk:navigate';

function currentPath(): string {
  const p = window.location.pathname.startsWith(BASE) ? window.location.pathname.slice(BASE.length) : window.location.pathname;
  return p.replace(/\/+$/, '') || '/';
}

export function navigate(to: string): void {
  window.history.pushState(null, '', BASE + to);
  window.dispatchEvent(new Event(NAV_EVENT));
  window.scrollTo(0, 0);
}

export function usePath(): string {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const update = () => setPath(currentPath());
    window.addEventListener('popstate', update);
    window.addEventListener(NAV_EVENT, update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener(NAV_EVENT, update);
    };
  }, []);
  return path;
}

export function Link({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={BASE + to} onClick={onClick} className={className}>
      {children}
    </a>
  );
}
