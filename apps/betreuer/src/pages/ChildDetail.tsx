import { useState, type FormEvent } from 'react';
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
    if (child.active && !(await confirmDialog(`${child.displayName} deaktivieren? Das Kind kann sich dann nicht mehr anmelden. Der Lernstand bleibt erhalten.`, { confirmLabel: 'Deaktivieren', danger: true }))) return;
    if (await attempt(() => api.patch(`/children/${id}`, { active: !child.active }), child.active ? 'Konto deaktiviert' : 'Konto aktiviert')) void reload();
  };

  const remove = async () => {
    if (!(await confirmDialog(`${child.displayName} endgültig löschen? Konto und gesamter Lernstand werden unwiderruflich gelöscht.`, { confirmLabel: 'Endgültig löschen', danger: true }))) return;
    if (await attempt(() => api.del(`/children/${id}`), 'Kind gelöscht')) navigate('/kinder');
  };

  const unlock = async () => {
    if (await attempt(() => api.post(`/children/${id}/unlock`), 'Konto entsperrt')) void reload();
  };

  const resetDeck = async (deck: AssignedDeck) => {
    if (!(await confirmDialog(`Lernstand von „${deck.title}“ für ${child.displayName} zurücksetzen? Das Kind beginnt dann wieder bei Runde 1.`, { confirmLabel: 'Zurücksetzen', danger: true }))) return;
    if (await attempt(() => api.post(`/children/${id}/decks/${deck.id}/reset`), 'Lernstand zurückgesetzt')) void reload();
  };

  return (
    <div className="page">
      <div className="breadcrumbs"><Link to="/kinder">Kinder</Link> › {child.displayName}</div>
      <div className="page-head">
        <div>
          <h1>{child.displayName}</h1>
          <div className="muted">
            Benutzername <span className="mono">{child.username}</span> · angelegt {formatDate(child.createdAt, false)} · zuletzt angemeldet {formatDate(child.lastLoginAt)}
          </div>
        </div>
        <div className="head-badges">
          {!child.active && <span className="badge badge-off">Deaktiviert</span>}
          {child.locked && <span className="badge badge-warn">Gesperrt (zu viele Fehlversuche)</span>}
        </div>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Kartenstapel &amp; Fortschritt</h2>
          <button className="btn" onClick={() => setAssigning(true)}>Stapel zuteilen</button>
        </div>
        {decks.length === 0 ? (
          <EmptyState title="Noch keine Stapel zugeteilt">
            <button className="btn btn-primary" onClick={() => setAssigning(true)}>Stapel zuteilen</button>
          </EmptyState>
        ) : (
          <div className="deck-progress-list">
            {decks.map((d) => (
              <div key={d.id} className="deck-progress">
                <div className="deck-progress-main">
                  <div className="deck-progress-title">
                    <Link to={`/stapel/${d.id}`}>{d.title}</Link>
                    <StatusBadge status={d.progress.status} />
                  </div>
                  <ProgressBar value={d.progress.solved} max={d.progress.totalCards} />
                  <div className="muted small">
                    {d.progress.solved} von {d.progress.totalCards} Karten richtig
                    {d.progress.status === 'in_arbeit' && ` · Runde ${d.progress.round}`}
                    {d.progress.completions > 0 && ` · ${d.progress.completions}× abgeschlossen`}
                    {d.progress.lastActivityAt && ` · zuletzt ${formatDate(d.progress.lastActivityAt)}`}
                  </div>
                </div>
                <div className="deck-progress-actions">
                  <button className="btn btn-small" onClick={() => setOpenDeck(openDeck === d.id ? null : d.id)}>{openDeck === d.id ? 'Details ausblenden' : 'Details'}</button>
                  {d.progress.status !== 'neu' && <button className="btn btn-small" onClick={() => void resetDeck(d)}>Zurücksetzen</button>}
                </div>
                {openDeck === d.id && <CardStats childId={id} deckId={d.id} />}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Konto</h2>
        <div className="button-row">
          <button className="btn" onClick={() => setEditing(true)}>Name / Benutzername ändern</button>
          <button className="btn" onClick={() => setPwOpen(true)}>Neues Passwort vergeben</button>
          {child.locked && <button className="btn" onClick={() => void unlock()}>Entsperren</button>}
          <button className="btn" onClick={() => void toggleActive()}>{child.active ? 'Deaktivieren' : 'Aktivieren'}</button>
          <button className="btn btn-danger-outline" onClick={() => void remove()}>Löschen</button>
        </div>
        <p className="muted small">Passwörter werden nur verschlüsselt (als Hash) gespeichert. Ein vergessenes Passwort kann nicht angezeigt, aber jederzeit neu vergeben werden.</p>
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
      <thead><tr><th>Karte</th><th>Typ</th><th>Aktueller Durchgang</th><th title="Über alle Durchgänge">Falsch gesamt</th></tr></thead>
      <tbody>
        {hard.map((c) => (
          <tr key={c.cardId}>
            <td>{c.question || <span className="muted">(nur Bild)</span>}</td>
            <td className="muted">{CARD_TYPE_LABELS[c.type]}</td>
            <td>{c.solved ? <span className="ok">✓ richtig</span> : c.attempts > 0 ? <span className="warn">noch offen</span> : <span className="muted">noch nicht dran</span>}</td>
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
    if (await attempt(() => api.patch(`/children/${child.id}`, { displayName, username }), 'Gespeichert')) onSaved();
  };
  return (
    <Modal title="Kind bearbeiten" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name"><input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={80} /></Field>
        <Field label="Benutzername"><input className="mono" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} required minLength={3} maxLength={32} /></Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary">Speichern</button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordModal({ childId, onClose, onSaved }: { childId: number; onClose: () => void; onSaved: (pw: string) => void }) {
  const [password, setPassword] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await attempt(() => api.post(`/children/${childId}/password`, { password }), 'Neues Passwort gesetzt')) onSaved(password);
  };
  return (
    <Modal title="Neues Passwort vergeben" onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted">Das alte Passwort wird ungültig und das Kind wird auf allen Geräten abgemeldet. Eine Sperre wird aufgehoben.</p>
        <Field label="Neues Passwort"><PasswordInput value={password} onChange={setPassword} forChild minLength={6} /></Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary">Passwort setzen</button>
        </div>
      </form>
    </Modal>
  );
}

function AssignDecksModal({ childId, assigned, onClose, onSaved }: { childId: number; assigned: number[]; onClose: () => void; onSaved: () => void }) {
  const { data, error } = useLoad(() => api.get<{ decks: DeckListItem[] }>('/decks').then((r) => r.decks));
  const [selected, setSelected] = useState<number[]>(assigned);
  const save = async () => {
    if (await attempt(() => api.put(`/children/${childId}/decks`, { deckIds: selected }), 'Zuteilung gespeichert')) onSaved();
  };
  return (
    <Modal title="Kartenstapel zuteilen" onClose={onClose}>
      {!data ? <Loading error={error} /> : data.length === 0 ? (
        <EmptyState title="Es gibt noch keine Kartenstapel"><Link to="/stapel">Stapel anlegen</Link></EmptyState>
      ) : (
        <>
          <p className="muted">Wird ein Stapel entfernt und später wieder zugeteilt, bleibt der bisherige Lernstand erhalten.</p>
          <div className="checklist">
            {data.map((d) => (
              <label key={d.id} className="check">
                <input type="checkbox" checked={selected.includes(d.id)}
                  onChange={(e) => setSelected(e.target.checked ? [...selected, d.id] : selected.filter((x) => x !== d.id))} />
                <span>{d.title} <span className="muted">({d.cardCount} Karten)</span></span>
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button className="btn" onClick={onClose}>Abbrechen</button>
            <button className="btn btn-primary" onClick={() => void save()}>Speichern</button>
          </div>
        </>
      )}
    </Modal>
  );
}
