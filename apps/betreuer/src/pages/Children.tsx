import { useState, type FormEvent } from 'react';
import { api, formatDate, suggestUsername, type ChildListItem, type DeckListItem, type User } from '../api.ts';
import { CredentialsModal, PasswordInput } from '../components/credentials.tsx';
import { EmptyState, Field, Loading, Modal, toast, useLoad } from '../components/ui.tsx';
import { Link, navigate } from '../router.tsx';

export function ChildrenPage() {
  const { data, error, reload } = useLoad(() => api.get<{ children: ChildListItem[] }>('/children').then((r) => r.children));
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ child: User; password: string } | null>(null);

  const q = search.trim().toLowerCase();
  const list = (data ?? []).filter((c) => !q || c.displayName.toLowerCase().includes(q) || c.username.includes(q));

  return (
    <div className="page">
      <div className="page-head">
        <h1>Kinder</h1>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Kind anlegen</button>
      </div>

      {!data ? (
        <Loading error={error} onRetry={reload} />
      ) : data.length === 0 ? (
        <EmptyState title="Noch keine Kinder angelegt">
          <p>Lege für jedes Kind ein Konto an. Danach kannst du ihm Kartenstapel zuteilen.</p>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>Erstes Kind anlegen</button>
        </EmptyState>
      ) : (
        <div className="panel">
          <input className="search" type="search" placeholder="Suchen …" value={search} onChange={(e) => setSearch(e.target.value)} />
          <table className="table table-click">
            <thead>
              <tr><th>Name</th><th>Benutzername</th><th>Stapel</th><th>Zuletzt gelernt</th><th>Status</th></tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} onClick={() => navigate(`/kinder/${c.id}`)}>
                  <td><Link to={`/kinder/${c.id}`}>{c.displayName}</Link></td>
                  <td className="mono">{c.username}</td>
                  <td>{c.deckCount === 0 ? <span className="muted">keine</span> : `${c.decksFinished} / ${c.deckCount} abgeschlossen`}</td>
                  <td>{formatDate(c.lastActivityAt)}</td>
                  <td>
                    {!c.active ? <span className="badge badge-off">Deaktiviert</span>
                      : c.locked ? <span className="badge badge-warn">Gesperrt</span>
                      : <span className="badge badge-ok">Aktiv</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <CreateChildModal
          onClose={() => setCreating(false)}
          onCreated={(child, password) => {
            setCreating(false);
            setCreated({ child, password });
            void reload();
          }}
        />
      )}
      {created && (
        <CredentialsModal
          name={created.child.displayName}
          username={created.child.username}
          password={created.password}
          onClose={() => {
            const id = created.child.id;
            setCreated(null);
            navigate(`/kinder/${id}`);
          }}
        />
      )}
    </div>
  );
}

function CreateChildModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: User, password: string) => void }) {
  const decks = useLoad(() => api.get<{ decks: DeckListItem[] }>('/decks').then((r) => r.decks));
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [password, setPassword] = useState('');
  const [deckIds, setDeckIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { child } = await api.post<{ child: User }>('/children', { displayName, username, password, deckIds });
      toast.ok('Kind angelegt');
      onCreated(child, password);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Kind anlegen" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name" hint="Vorname oder Spitzname reicht – bitte nur so viele Daten wie nötig.">
          <input value={displayName} required maxLength={80} onChange={(e) => {
            setDisplayName(e.target.value);
            if (!usernameTouched) setUsername(suggestUsername(e.target.value));
          }} />
        </Field>
        <Field label="Benutzername" hint="Damit meldet sich das Kind an. Kleinbuchstaben, Ziffern, Punkt, Minus.">
          <input className="mono" value={username} required minLength={3} maxLength={32} pattern="[a-z0-9][a-z0-9._\-]*" autoCapitalize="none"
            onChange={(e) => { setUsername(e.target.value.toLowerCase()); setUsernameTouched(true); }} />
        </Field>
        <Field label="Passwort" hint="Mindestens 6 Zeichen. „Vorschlag“ erzeugt ein leicht merkbares Passwort.">
          <PasswordInput value={password} onChange={setPassword} forChild minLength={6} />
        </Field>
        {decks.data && decks.data.length > 0 && (
          <Field label="Kartenstapel zuteilen (optional)">
            <div className="checklist">
              {decks.data.map((d) => (
                <label key={d.id} className="check">
                  <input type="checkbox" checked={deckIds.includes(d.id)}
                    onChange={(e) => setDeckIds(e.target.checked ? [...deckIds, d.id] : deckIds.filter((x) => x !== d.id))} />
                  {d.title} <span className="muted">({d.cardCount} Karten)</span>
                </label>
              ))}
            </div>
          </Field>
        )}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Speichern …' : 'Kind anlegen'}</button>
        </div>
      </form>
    </Modal>
  );
}
