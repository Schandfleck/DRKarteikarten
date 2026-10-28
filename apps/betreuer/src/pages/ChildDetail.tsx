import { useState, type FormEvent } from 'react';
import { t } from '../i18n.ts';
import { api, CARD_TYPE_LABELS, formatDate, type CardStat, type DeckListItem, type Progress, type User } from '../api.ts';
import { CredentialsModal, PasswordInput } from '../components/credentials.tsx';
import { attempt, confirmDialog, EmptyState, Field, Loading, Modal, ProgressBar, StatusBadge, useLoad } from '../components/ui.tsx';
import { Link, navigate } from '../router.tsx';

type AssignedDeck = { id: number; title: string; progress: Progress };

export function ChildDetailPage({ id }: { id: number }) {
  const { data, error, reload } = useLoad(() => api.get<{ child: User; decks: AssignedDeck[] }>(`/children/${id}`), [id]);
  const [editing, setEditing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [newCreds, setNewCreds] = useState<string | null>(null);
  const [openDeck, setOpenDeck] = useState<number | null>(null);

  if (!data) return <div className="page"><Loading error={error} onRetry={reload} /></div>;
  const { child, decks } = data;

  const toggleActive = async () => {
    if (child.active && !(await confirmDialog(t('{name} deaktivieren? Das Kind kann sich dann nicht mehr anmelden. Der Lernstand bleibt erhalten.', { name: child.displayName }), { confirmLabel: t('Deaktivieren'), danger: true }))) return;
    if (await attempt(() => api.patch(`/children/${id}`, { active: !child.active }), child.active ? t('Konto deaktiviert') : t('Konto aktiviert'))) void reload();
  };

  const remove = async () => {
    if (!(await confirmDialog(t('{name} endgültig löschen? Konto und gesamter Lernstand werden unwiderruflich gelöscht.', { name: child.displayName }), { confirmLabel: t('Endgültig löschen'), danger: true }))) return;
    if (await attempt(() => api.del(`/children/${id}`), t('Kind gelöscht'))) navigate('/kinder');
  };

  const unlock = async () => {
    if (await attempt(() => api.post(`/children/${id}/unlock`), t('Konto entsperrt'))) void reload();
  };

  const resetDeck = async (deck: AssignedDeck) => {
    if (!(await confirmDialog(t('Lernstand von „{deck}“ für {name} zurücksetzen? Das Kind beginnt dann wieder bei Runde 1.', { deck: deck.title, name: child.displayName }), { confirmLabel: t('Zurücksetzen'), danger: true }))) return;
    if (await attempt(() => api.post(`/children/${id}/decks/${deck.id}/reset`), t('Lernstand zurückgesetzt'))) void reload();
  };

  return (
    <div className="page">
      <div className="breadcrumbs"><Link to="/kinder">{t('Kinder')}</Link> {t('›')} <bdi>{child.displayName}</bdi></div>
      <div className="page-head">
        <div>
          <h1 dir="auto">{child.displayName}</h1>
          <div className="muted">
            {t('Benutzername')} <span className="mono" dir="ltr">{child.username}</span> · {t('angelegt {date}', { date: formatDate(child.createdAt, false) })} · {t('zuletzt angemeldet {date}', { date: formatDate(child.lastLoginAt) })}
          </div>
        </div>
        <div className="head-badges">
          {!child.active && <span className="badge badge-off">{t('Deaktiviert')}</span>}
          {child.locked && <span className="badge badge-warn">{t('Gesperrt (zu viele Fehlversuche)')}</span>}
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>{t('Kartenstapel & Fortschritt')}</h2>
          <button className="btn" onClick={() => setAssigning(true)}>{t('Stapel zuteilen')}</button>
        </div>
        {decks.length === 0 ? (
          <EmptyState title={t('Noch keine Stapel zugeteilt')}>
            <button className="btn btn-primary" onClick={() => setAssigning(true)}>{t('Stapel zuteilen')}</button>
          </EmptyState>
        ) : (
          <div className="deck-progress-list">
            {decks.map((d) => (
              <div key={d.id} className="deck-progress">
                <div className="deck-progress-main">
                  <div className="deck-progress-title">
                    <Link to={`/stapel/${d.id}`}><bdi>{d.title}</bdi></Link>
                    <StatusBadge status={d.progress.status} />
                  </div>
                  <ProgressBar value={d.progress.solved} max={d.progress.totalCards} />
                  <div className="muted small">
                    {t('{n} von {total} Karten richtig', { n: d.progress.solved, total: d.progress.totalCards })}
                    {d.progress.status === 'in_arbeit' && ` · ${t('Runde {n}', { n: d.progress.round })}`}
                    {d.progress.completions > 0 && ` · ${t('{n}× abgeschlossen', { n: d.progress.completions })}`}
                    {d.progress.lastActivityAt && ` · ${t('zuletzt {date}', { date: formatDate(d.progress.lastActivityAt) })}`}
                  </div>
                </div>
                <div className="deck-progress-actions">
                  <button className="btn btn-small" onClick={() => setOpenDeck(openDeck === d.id ? null : d.id)}>{openDeck === d.id ? t('Details ausblenden') : t('Details')}</button>
                  {d.progress.status !== 'neu' && <button className="btn btn-small" onClick={() => void resetDeck(d)}>{t('Zurücksetzen')}</button>}
                </div>
                {openDeck === d.id && <CardStats childId={id} deckId={d.id} />}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>{t('Konto')}</h2>
        <div className="button-row">
          <button className="btn" onClick={() => setEditing(true)}>{t('Name / Benutzername ändern')}</button>
          <button className="btn" onClick={() => setPwOpen(true)}>{t('Neues Passwort vergeben')}</button>
          {child.locked && <button className="btn" onClick={() => void unlock()}>{t('Entsperren')}</button>}
          <button className="btn" onClick={() => void toggleActive()}>{child.active ? t('Deaktivieren') : t('Aktivieren')}</button>
          <button className="btn btn-danger-outline" onClick={() => void remove()}>{t('Löschen')}</button>
        </div>
        <p className="muted small">{t('Passwörter werden nur verschlüsselt (als Hash) gespeichert. Ein vergessenes Passwort kann nicht angezeigt, aber jederzeit neu vergeben werden.')}</p>
      </section>

      {editing && <EditChildModal child={child} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void reload(); }} />}
      {assigning && <AssignDecksModal childId={id} assigned={decks.map((d) => d.id)} onClose={() => setAssigning(false)} onSaved={() => { setAssigning(false); void reload(); }} />}
      {pwOpen && (
        <PasswordModal childId={id} onClose={() => setPwOpen(false)} onSaved={(pw) => { setPwOpen(false); setNewCreds(pw); void reload(); }} />
      )}
      {newCreds && <CredentialsModal name={child.displayName} username={child.username} password={newCreds} onClose={() => setNewCreds(null)} />}
    </div>
  );
}

function CardStats({ childId, deckId }: { childId: number; deckId: number }) {
  const { data, error } = useLoad(() => api.get<{ cards: CardStat[] }>(`/children/${childId}/decks/${deckId}`).then((r) => r.cards), [childId, deckId]);
  if (!data) return <Loading error={error} />;
  const hard = [...data].sort((a, b) => b.wrongTotal - a.wrongTotal);
  return (
    <table className="table table-compact deck-progress-details">
      <thead><tr><th>{t('Karte')}</th><th>{t('Typ')}</th><th>{t('Aktueller Durchgang')}</th><th title={t('Über alle Durchgänge')}>{t('Falsch gesamt')}</th></tr></thead>
      <tbody>
        {hard.map((c) => (
          <tr key={c.cardId}>
            <td dir="auto">{c.question || <span className="muted">{t('(nur Bild)')}</span>}</td>
            <td className="muted">{t(CARD_TYPE_LABELS[c.type])}</td>
            <td>{c.solved ? <span className="ok">{t('✓ richtig')}</span> : c.attempts > 0 ? <span className="warn">{t('noch offen')}</span> : <span className="muted">{t('noch nicht dran')}</span>}</td>
            <td>{c.wrongTotal > 0 ? <strong className={c.wrongTotal >= 3 ? 'warn' : ''}>{c.wrongTotal}×</strong> : '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EditChildModal({ child, onClose, onSaved }: { child: User; onClose: () => void; onSaved: () => void }) {
  const [displayName, setDisplayName] = useState(child.displayName);
  const [username, setUsername] = useState(child.username);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await attempt(() => api.patch(`/children/${child.id}`, { displayName, username }), t('Gespeichert'))) onSaved();
  };
  return (
    <Modal title={t('Kind bearbeiten')} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label={t('Name')}><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={80} dir="auto" /></Field>
        <Field label={t('Benutzername')}><input className="mono" dir="ltr" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} required minLength={3} maxLength={32} /></Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>{t('Abbrechen')}</button>
          <button className="btn btn-primary">{t('Speichern')}</button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordModal({ childId, onClose, onSaved }: { childId: number; onClose: () => void; onSaved: (pw: string) => void }) {
  const [password, setPassword] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await attempt(() => api.post(`/children/${childId}/password`, { password }), t('Neues Passwort gesetzt'))) onSaved(password);
  };
  return (
    <Modal title={t('Neues Passwort vergeben')} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted">{t('Das alte Passwort wird ungültig und das Kind wird auf allen Geräten abgemeldet. Eine Sperre wird aufgehoben.')}</p>
        <Field label={t('Neues Passwort')}><PasswordInput value={password} onChange={setPassword} forChild minLength={6} /></Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>{t('Abbrechen')}</button>
          <button className="btn btn-primary">{t('Passwort setzen')}</button>
        </div>
      </form>
    </Modal>
  );
}

function AssignDecksModal({ childId, assigned, onClose, onSaved }: { childId: number; assigned: number[]; onClose: () => void; onSaved: () => void }) {
  const { data, error } = useLoad(() => api.get<{ decks: DeckListItem[] }>('/decks').then((r) => r.decks));
  const [selected, setSelected] = useState<number[]>(assigned);
  const save = async () => {
    if (await attempt(() => api.put(`/children/${childId}/decks`, { deckIds: selected }), t('Zuteilung gespeichert'))) onSaved();
  };
  return (
    <Modal title={t('Kartenstapel zuteilen')} onClose={onClose}>
      {!data ? <Loading error={error} /> : data.length === 0 ? (
        <EmptyState title={t('Es gibt noch keine Kartenstapel')}><Link to="/stapel">{t('Stapel anlegen')}</Link></EmptyState>
      ) : (
        <>
          <p className="muted">{t('Wird ein Stapel entfernt und später wieder zugeteilt, bleibt der bisherige Lernstand erhalten.')}</p>
          <div className="checklist">
            {data.map((d) => (
              <label key={d.id} className="check">
                <input type="checkbox" checked={selected.includes(d.id)}
                  onChange={(e) => setSelected(e.target.checked ? [...selected, d.id] : selected.filter((x) => x !== d.id))} />
                <span><bdi>{d.title}</bdi> <span className="muted">({t('{n} Karten', { n: d.cardCount })})</span></span>
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button className="btn" onClick={onClose}>{t('Abbrechen')}</button>
            <button className="btn btn-primary" onClick={() => void save()}>{t('Speichern')}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
