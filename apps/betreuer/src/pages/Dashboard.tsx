import { api, formatDate, type ChildListItem, type DeckListItem } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { EmptyState, Loading, useLoad } from '../components/ui.tsx';
import { Link } from '../router.tsx';

export function DashboardPage() {
  const { user } = useAuth();
  const { data, error, reload } = useLoad(async () => {
    const [c, d] = await Promise.all([
      api.get<{ children: ChildListItem[] }>('/children'),
      api.get<{ decks: DeckListItem[] }>('/decks'),
    ]);
    return { children: c.children, decks: d.decks };
  });

  if (!data) return <div className="page"><Loading error={error} onRetry={reload} /></div>;

  const active = data.children.filter((c) => c.active);
  const recent = [...active].filter((c) => c.lastActivityAt).sort((a, b) => (b.lastActivityAt! > a.lastActivityAt! ? 1 : -1)).slice(0, 8);
  const cards = data.decks.reduce((n, d) => n + d.cardCount, 0);

  return (
    <div className="page">
      <h1>Hallo {user.displayName}!</h1>
      <div className="stats">
        <Link to="/kinder" className="stat"><span className="stat-value">{active.length}</span><span className="stat-label">aktive Kinder</span></Link>
        <Link to="/stapel" className="stat"><span className="stat-value">{data.decks.length}</span><span className="stat-label">Kartenstapel</span></Link>
        <Link to="/stapel" className="stat"><span className="stat-value">{cards}</span><span className="stat-label">Karten insgesamt</span></Link>
      </div>

      {data.decks.length === 0 || data.children.length === 0 ? (
        <div className="panel">
          <h2>So geht's los</h2>
          <ol className="steps">
            <li className={data.decks.length ? 'done' : ''}><Link to="/stapel">Kartenstapel anlegen</Link> und Karten hinzufügen (Text, Bilder, Eingabe- oder Auswahlfragen).</li>
            <li className={data.children.length ? 'done' : ''}><Link to="/kinder">Kinderkonten anlegen</Link> – Benutzername und Passwort werden dabei vergeben.</li>
            <li>Jedem Kind die passenden Stapel zuteilen.</li>
            <li>Das Kind meldet sich unter <span className="mono">{window.location.origin}/</span> an und lernt.</li>
          </ol>
        </div>
      ) : (
        <div className="panel">
          <h2>Zuletzt aktiv</h2>
          {recent.length === 0 ? (
            <EmptyState title="Noch keine Lernaktivität">Sobald Kinder lernen, erscheinen sie hier.</EmptyState>
          ) : (
            <table className="table">
              <thead><tr><th>Kind</th><th>Stapel abgeschlossen</th><th>Zuletzt gelernt</th></tr></thead>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id}>
                    <td><Link to={`/kinder/${c.id}`}>{c.displayName}</Link></td>
                    <td>{c.decksFinished} von {c.deckCount}</td>
                    <td>{formatDate(c.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
