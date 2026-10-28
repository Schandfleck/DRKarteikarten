import { api, formatDate, type ChildListItem, type DeckListItem } from '../api.ts';
import { t } from '../i18n.ts';
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
      <h1>{t('Hallo {name}!', { name: user.displayName })}</h1>
      <div className="stats">
        <Link to="/kinder" className="stat"><span className="stat-value">{active.length}</span><span className="stat-label">{t('aktive Kinder')}</span></Link>
        <Link to="/stapel" className="stat"><span className="stat-value">{data.decks.length}</span><span className="stat-label">{t('Kartenstapel')}</span></Link>
        <Link to="/stapel" className="stat"><span className="stat-value">{cards}</span><span className="stat-label">{t('Karten insgesamt')}</span></Link>
      </div>

      {data.decks.length === 0 || data.children.length === 0 ? (
        <div className="panel">
          <h2>{t("So geht's los")}</h2>
          <ol className="steps">
            <li className={data.decks.length ? 'done' : ''}><Link to="/stapel">{t('Kartenstapel anlegen')}</Link> {t('und Karten hinzufügen (Text, Bilder, Eingabe- oder Auswahlfragen).')}</li>
            <li className={data.children.length ? 'done' : ''}><Link to="/kinder">{t('Kinderkonten anlegen')}</Link> – {t('Benutzername und Passwort werden dabei vergeben.')}</li>
            <li>{t('Jedem Kind die passenden Stapel zuteilen.')}</li>
            <li>{t('Das Kind meldet sich hier an und lernt:')} <span className="mono" dir="ltr">{window.location.origin}/</span></li>
          </ol>
        </div>
      ) : (
        <div className="panel">
          <h2>{t('Zuletzt aktiv')}</h2>
          {recent.length === 0 ? (
            <EmptyState title={t('Noch keine Lernaktivität')}>{t('Sobald Kinder lernen, erscheinen sie hier.')}</EmptyState>
          ) : (
            <table className="table">
              <thead><tr><th>{t('Kind')}</th><th>{t('Stapel abgeschlossen')}</th><th>{t('Zuletzt gelernt')}</th></tr></thead>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id}>
                    <td><Link to={`/kinder/${c.id}`}><bdi>{c.displayName}</bdi></Link></td>
                    <td>{t('{n} von {total}', { n: c.decksFinished, total: c.deckCount })}</td>
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
