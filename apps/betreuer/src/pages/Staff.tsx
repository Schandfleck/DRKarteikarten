import { useState, type FormEvent } from 'react';
import { api, formatDate, ROLE_LABELS, suggestUsername, type User } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { PasswordInput } from '../components/credentials.tsx';
import { attempt, confirmDialog, Field, Loading, Modal, useLoad } from '../components/ui.tsx';

export function StaffPage() {
  const { user: me } = useAuth();
  const { data, error, reload } = useLoad(() => api.get<{ staff: User[] }>('/staff').then((r) => r.staff));
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit' | 'password'; user: User } | null>(null);

  const toggle = async (u: User) => {
    if (u.active && !(await confirmDialog(`${u.displayName} deaktivieren? Die Person kann sich dann nicht mehr anmelden.`, { confirmLabel: 'Deaktivieren', danger: true }))) return;
    if (await attempt(() => api.patch(`/staff/${u.id}`, { active: !u.active }), u.active ? 'Deaktiviert' : 'Aktiviert')) void reload();
  };
  const remove = async (u: User) => {
    if (!(await confirmDialog(`Konto von ${u.displayName} endgültig löschen? Erstellte Karten und Kinder bleiben erhalten.`, { confirmLabel: 'Löschen', danger: true }))) return;
    if (await attempt(() => api.del(`/staff/${u.id}`), 'Konto gelöscht')) void reload();
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Betreuer</h1>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>+ Betreuer anlegen</button>
      </div>
      <div className="alert alert-info">
        <strong>Betreuer</strong> können Kinder anlegen, Karten bearbeiten und Fortschritte sehen. <strong>Admins</strong> können zusätzlich Betreuer verwalten und das Protokoll einsehen.
      </div>
      {!data ? <Loading error={error} onRetry={reload} /> : (
        <div className="panel">
          <table className="table">
            <thead><tr><th>Name</th><th>Benutzername</th><th>Rolle</th><th>Zuletzt angemeldet</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <td>{u.displayName}{u.id === me.id && <span className="muted"> (du)</span>}</td>
                  <td className="mono">{u.username}</td>
                  <td>{ROLE_LABELS[u.role]}</td>
                  <td>{formatDate(u.lastLoginAt)}</td>
                  <td>{!u.active ? <span className="badge badge-off">Deaktiviert</span> : u.locked ? <span className="badge badge-warn">Gesperrt</span> : <span className="badge badge-ok">Aktiv</span>}</td>
                  <td className="row-actions">
                    <button className="btn btn-small" onClick={() => setModal({ mode: 'edit', user: u })}>Bearbeiten</button>
                    <button className="btn btn-small" onClick={() => setModal({ mode: 'password', user: u })}>Passwort</button>
                    {u.id !== me.id && <button className="btn btn-small" onClick={() => void toggle(u)}>{u.active ? 'Deaktivieren' : 'Aktivieren'}</button>}
                    {u.id !== me.id && <button className="btn btn-small btn-danger-outline" onClick={() => void remove(u)}>Löschen</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal?.mode === 'create' && <CreateStaffModal onClose={() => setModal(null)} onSaved={() => { setModal(null); void reload(); }} />}
      {modal?.mode === 'edit' && <EditStaffModal user={modal.user} onClose={() => setModal(null)} onSaved={() => { setModal(null); void reload(); }} />}
      {modal?.mode === 'password' && <StaffPasswordModal user={modal.user} onClose={() => setModal(null)} />}
    </div>
  );
}

function CreateStaffModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [touched, setTouched] = useState(false);
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'betreuer' | 'admin'>('betreuer');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await attempt(() => api.post('/staff', { displayName, username, password, role }), 'Betreuer angelegt')) onSaved();
  };
  return (
    <Modal title="Betreuer anlegen" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name"><input value={displayName} required maxLength={80} onChange={(e) => { setDisplayName(e.target.value); if (!touched) setUsername(suggestUsername(e.target.value)); }} /></Field>
        <Field label="Benutzername"><input className="mono" value={username} required minLength={3} maxLength={32} onChange={(e) => { setUsername(e.target.value.toLowerCase()); setTouched(true); }} /></Field>
        <Field label="Erstes Passwort" hint="Mindestens 10 Zeichen. Die Person sollte es nach der ersten Anmeldung unter „Mein Konto“ ändern.">
          <PasswordInput value={password} onChange={setPassword} minLength={10} />
        </Field>
        <Field label="Rolle">
          <select value={role} onChange={(e) => setRole(e.target.value as 'betreuer' | 'admin')}>
            <option value="betreuer">Betreuer</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary">Anlegen</button>
        </div>
      </form>
    </Modal>
  );
}

function EditStaffModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const { user: me } = useAuth();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [role, setRole] = useState(user.role);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await attempt(() => api.patch(`/staff/${user.id}`, { displayName, role }), 'Gespeichert')) onSaved();
  };
  return (
    <Modal title="Betreuer bearbeiten" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name"><input value={displayName} required maxLength={80} onChange={(e) => setDisplayName(e.target.value)} /></Field>
        <Field label="Rolle">
          <select value={role} onChange={(e) => setRole(e.target.value as User['role'])} disabled={user.id === me.id}>
            <option value="betreuer">Betreuer</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary">Speichern</button>
        </div>
      </form>
    </Modal>
  );
}

function StaffPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await attempt(() => api.post(`/staff/${user.id}/password`, { password }), 'Passwort gesetzt')) onClose();
  };
  return (
    <Modal title={`Neues Passwort für ${user.displayName}`} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted">Die Person wird auf allen Geräten abgemeldet. Teile das neue Passwort auf sicherem Weg mit (nicht per E-Mail).</p>
        <Field label="Neues Passwort"><PasswordInput value={password} onChange={setPassword} minLength={10} /></Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn btn-primary">Passwort setzen</button>
        </div>
      </form>
    </Modal>
  );
}
