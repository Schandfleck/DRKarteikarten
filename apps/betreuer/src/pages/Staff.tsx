import { useState, type FormEvent } from 'react';
import { t } from '../i18n.ts';
import { api, formatDate, ROLE_LABELS, suggestUsername, type User } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { PasswordInput } from '../components/credentials.tsx';
import { attempt, confirmDialog, Field, Loading, Modal, useLoad } from '../components/ui.tsx';

export function StaffPage() {
  const { user: me } = useAuth();
  const { data, error, reload } = useLoad(() => api.get<{ staff: User[] }>('/staff').then((r) => r.staff));
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit' | 'password'; user: User } | null>(null);

  const toggle = async (u: User) => {
    if (u.active && !(await confirmDialog(t('{name} deaktivieren? Die Person kann sich dann nicht mehr anmelden.', { name: u.displayName }), { confirmLabel: t('Deaktivieren'), danger: true }))) return;
    if (await attempt(() => api.patch(`/staff/${u.id}`, { active: !u.active }), u.active ? t('Deaktiviert') : t('Aktiviert'))) void reload();
  };
  const remove = async (u: User) => {
    if (!(await confirmDialog(t('Konto von {name} endgültig löschen? Erstellte Karten und Kinder bleiben erhalten.', { name: u.displayName }), { confirmLabel: t('Löschen'), danger: true }))) return;
    if (await attempt(() => api.del(`/staff/${u.id}`), t('Konto gelöscht'))) void reload();
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>{t('Betreuer')}</h1>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>{t('+ Betreuer anlegen')}</button>
      </div>
      <div className="alert alert-info">
        {t('Betreuer können Kinder anlegen, Karten bearbeiten und Fortschritte sehen. Admins können zusätzlich Betreuer verwalten und das Protokoll einsehen.')}
      </div>
      {!data ? <Loading error={error} onRetry={reload} /> : (
        <div className="panel">
          <table className="table">
            <thead><tr><th>{t('Name')}</th><th>{t('Benutzername')}</th><th>{t('Rolle')}</th><th>{t('Zuletzt angemeldet')}</th><th>{t('Status')}</th><th /></tr></thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <td><bdi>{u.displayName}</bdi>{u.id === me.id && <span className="muted"> {t('(du)')}</span>}</td>
                  <td className="mono" dir="ltr">{u.username}</td>
                  <td>{t(ROLE_LABELS[u.role])}</td>
                  <td>{formatDate(u.lastLoginAt)}</td>
                  <td>{!u.active ? <span className="badge badge-off">{t('Deaktiviert')}</span> : u.locked ? <span className="badge badge-warn">{t('Gesperrt')}</span> : <span className="badge badge-ok">{t('Aktiv')}</span>}</td>
                  <td className="row-actions">
                    <button className="btn btn-small" onClick={() => setModal({ mode: 'edit', user: u })}>{t('Bearbeiten')}</button>
                    <button className="btn btn-small" onClick={() => setModal({ mode: 'password', user: u })}>{t('Passwort')}</button>
                    {u.id !== me.id && <button className="btn btn-small" onClick={() => void toggle(u)}>{u.active ? t('Deaktivieren') : t('Aktivieren')}</button>}
                    {u.id !== me.id && <button className="btn btn-small btn-danger-outline" onClick={() => void remove(u)}>{t('Löschen')}</button>}
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
    if (await attempt(() => api.post('/staff', { displayName, username, password, role }), t('Betreuer angelegt'))) onSaved();
  };
  return (
    <Modal title={t('Betreuer anlegen')} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label={t('Name')}><input value={displayName} required maxLength={80} dir="auto" onChange={(e) => { setDisplayName(e.target.value); if (!touched) setUsername(suggestUsername(e.target.value)); }} /></Field>
        <Field label={t('Benutzername')}><input className="mono" dir="ltr" value={username} required minLength={3} maxLength={32} onChange={(e) => { setUsername(e.target.value.toLowerCase()); setTouched(true); }} /></Field>
        <Field label={t('Erstes Passwort')} hint={t('Mindestens 10 Zeichen. Die Person sollte es nach der ersten Anmeldung unter „Mein Konto“ ändern.')}>
          <PasswordInput value={password} onChange={setPassword} minLength={10} />
        </Field>
        <Field label={t('Rolle')}>
          <select value={role} onChange={(e) => setRole(e.target.value as 'betreuer' | 'admin')}>
            <option value="betreuer">{t('Betreuer')}</option>
            <option value="admin">{t('Admin')}</option>
          </select>
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>{t('Abbrechen')}</button>
          <button className="btn btn-primary">{t('Anlegen')}</button>
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
    if (await attempt(() => api.patch(`/staff/${user.id}`, { displayName, role }), t('Gespeichert'))) onSaved();
  };
  return (
    <Modal title={t('Betreuer bearbeiten')} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label={t('Name')}><input value={displayName} required maxLength={80} dir="auto" onChange={(e) => setDisplayName(e.target.value)} /></Field>
        <Field label={t('Rolle')}>
          <select value={role} onChange={(e) => setRole(e.target.value as User['role'])} disabled={user.id === me.id}>
            <option value="betreuer">{t('Betreuer')}</option>
            <option value="admin">{t('Admin')}</option>
          </select>
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>{t('Abbrechen')}</button>
          <button className="btn btn-primary">{t('Speichern')}</button>
        </div>
      </form>
    </Modal>
  );
}

function StaffPasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await attempt(() => api.post(`/staff/${user.id}/password`, { password }), t('Passwort gesetzt'))) onClose();
  };
  return (
    <Modal title={t('Neues Passwort für {name}', { name: user.displayName })} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="muted">{t('Die Person wird auf allen Geräten abgemeldet. Teile das neue Passwort auf sicherem Weg mit (nicht per E-Mail).')}</p>
        <Field label={t('Neues Passwort')}><PasswordInput value={password} onChange={setPassword} minLength={10} /></Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>{t('Abbrechen')}</button>
          <button className="btn btn-primary">{t('Passwort setzen')}</button>
        </div>
      </form>
    </Modal>
  );
}
