import { Router } from 'express';
import { z } from 'zod';
import { all, one, run, transaction } from '../db.ts';
import { audit } from '../lib/audit.ts';
import { HttpError, idParam, notFound, parse, zDisplayName, zPassword, zUsername } from '../lib/http.ts';
import { createUser, findUser, publicUser, setPassword, USER_COLUMNS, type UserRow } from '../lib/users.ts';
import { currentUser, deleteUserSessions, requireAdmin } from '../security/sessions.ts';

/** Verwaltung der Betreuer-Konten – nur für Admins. */
export const staffRouter = Router();
staffRouter.use(requireAdmin);

const zStaffRole = z.enum(['admin', 'betreuer'], { error: 'Ungültige Rolle.' });

function findStaff(id: number): UserRow {
  const user = findUser(id);
  if (!user || user.role === 'kind') throw notFound('Betreuer');
  return user;
}

function otherActiveAdmins(exceptId: number): number {
  return one<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id <> ?", exceptId)!.n;
}

staffRouter.get('/', (_req, res) => {
  const rows = all<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE role IN ('admin', 'betreuer') ORDER BY display_name COLLATE NOCASE`);
  res.json({ staff: rows.map(publicUser) });
});

staffRouter.post('/', async (req, res) => {
  const me = currentUser(res);
  const body = parse(z.object({ username: zUsername, displayName: zDisplayName, password: zPassword, role: zStaffRole }), req.body);
  const user = await createUser({ ...body, createdBy: me.id });
  audit(me, 'Betreuer angelegt', `${user.display_name} (${user.username}), Rolle: ${user.role}`);
  res.status(201).json({ user: publicUser(user) });
});

staffRouter.patch('/:id', (req, res) => {
  const me = currentUser(res);
  const user = findStaff(idParam(req));
  const body = parse(z.object({ displayName: zDisplayName.optional(), role: zStaffRole.optional(), active: z.boolean().optional() }), req.body);

  const losesAdmin = user.role === 'admin' && ((body.role && body.role !== 'admin') || body.active === false);
  if (losesAdmin && user.id === me.id) throw new HttpError(400, 'Du kannst dir nicht selbst die Admin-Rechte entziehen oder dich deaktivieren.');
  if (losesAdmin && otherActiveAdmins(user.id) === 0) throw new HttpError(400, 'Es muss mindestens ein aktiver Admin bleiben.');

  transaction(() => {
    if (body.displayName !== undefined) run('UPDATE users SET display_name = ? WHERE id = ?', body.displayName, user.id);
    if (body.role !== undefined) run('UPDATE users SET role = ? WHERE id = ?', body.role, user.id);
    if (body.active !== undefined) run('UPDATE users SET active = ? WHERE id = ?', body.active ? 1 : 0, user.id);
  });
  if (body.active === false) deleteUserSessions(user.id);
  audit(me, 'Betreuer geändert', `${user.username}: ${JSON.stringify(body)}`);
  res.json({ user: publicUser(findUser(user.id)!) });
});

staffRouter.post('/:id/password', async (req, res) => {
  const me = currentUser(res);
  const user = findStaff(idParam(req));
  const { password } = parse(z.object({ password: zPassword }), req.body);
  await setPassword(user, password, user.id === me.id ? (res.locals.token as string) : undefined);
  audit(me, 'Betreuer-Passwort zurückgesetzt', user.username);
  res.json({ ok: true });
});

staffRouter.delete('/:id', (req, res) => {
  const me = currentUser(res);
  const user = findStaff(idParam(req));
  if (user.id === me.id) throw new HttpError(400, 'Du kannst dein eigenes Konto nicht löschen.');
  if (user.role === 'admin' && otherActiveAdmins(user.id) === 0) throw new HttpError(400, 'Es muss mindestens ein aktiver Admin bleiben.');
  run('DELETE FROM users WHERE id = ?', user.id);
  audit(me, 'Betreuer gelöscht', `${user.display_name} (${user.username})`);
  res.json({ ok: true });
});
