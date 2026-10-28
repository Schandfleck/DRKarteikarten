import { Router } from 'express';
import { z } from 'zod';
import { all, now, one, run, transaction } from '../db.ts';
import { audit } from '../lib/audit.ts';
import { HttpError, idParam, notFound, parse, zDisplayName, zPassword, zUsername } from '../lib/http.ts';
import { cardStatistics, progressSummary, resetProgress } from '../lib/study.ts';
import { createUser, findUser, publicUser, setPassword, USER_COLUMNS, type UserRow } from '../lib/users.ts';
import { generateChildPassword } from '../security/passwords.ts';
import { currentUser, deleteUserSessions, requireStaff } from '../security/sessions.ts';

/** Kinderkonten anlegen, verwalten, Stapel zuteilen und Lernfortschritt ansehen – für alle Betreuer. */
export const childrenRouter = Router();
childrenRouter.use(requireStaff);

function findChild(id: number): UserRow {
  const user = findUser(id);
  if (!user || user.role !== 'kind') throw notFound('Kind');
  return user;
}

function assignedDecks(childId: number) {
  return all<{ id: number; title: string }>(
    `SELECT d.id, d.title FROM deck_assignments a JOIN decks d ON d.id = a.deck_id
      WHERE a.child_id = ? ORDER BY d.title COLLATE NOCASE`,
    childId,
  ).map((d) => ({ ...d, progress: progressSummary(childId, d.id) }));
}

childrenRouter.get('/password-suggestion', (_req, res) => {
  res.json({ password: generateChildPassword() });
});

childrenRouter.get('/', (_req, res) => {
  const rows = all<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE role = 'kind' ORDER BY display_name COLLATE NOCASE`);
  res.json({
    children: rows.map((u) => {
      const decks = assignedDecks(u.id);
      return {
        ...publicUser(u),
        deckCount: decks.length,
        decksFinished: decks.filter((d) => d.progress.completions > 0).length,
        lastActivityAt: decks.map((d) => d.progress.lastActivityAt).filter(Boolean).sort().at(-1) ?? null,
      };
    }),
  });
});

childrenRouter.post('/', async (req, res) => {
  const me = currentUser(res);
  const body = parse(z.object({
    username: zUsername,
    displayName: zDisplayName,
    password: zPassword,
    deckIds: z.array(z.number().int().positive()).default([]),
  }), req.body);
  const child = await createUser({ role: 'kind', username: body.username, displayName: body.displayName, password: body.password, createdBy: me.id });
  if (body.deckIds.length) setChildDecks(child.id, body.deckIds, me.id);
  audit(me, 'Kind angelegt', `${child.display_name} (${child.username})`);
  res.status(201).json({ child: publicUser(child) });
});

childrenRouter.get('/:id', (req, res) => {
  const child = findChild(idParam(req));
  res.json({ child: publicUser(child), decks: assignedDecks(child.id) });
});

childrenRouter.patch('/:id', (req, res) => {
  const me = currentUser(res);
  const child = findChild(idParam(req));
  const body = parse(z.object({ displayName: zDisplayName.optional(), username: zUsername.optional(), active: z.boolean().optional() }), req.body);
  if (body.username && body.username !== child.username && one('SELECT 1 FROM users WHERE username = ? AND id <> ?', body.username, child.id)) {
    throw new HttpError(409, 'Dieser Benutzername ist schon vergeben.');
  }
  transaction(() => {
    if (body.displayName !== undefined) run('UPDATE users SET display_name = ? WHERE id = ?', body.displayName, child.id);
    if (body.username !== undefined) run('UPDATE users SET username = ? WHERE id = ?', body.username, child.id);
    if (body.active !== undefined) run('UPDATE users SET active = ? WHERE id = ?', body.active ? 1 : 0, child.id);
  });
  if (body.active === false) deleteUserSessions(child.id);
  audit(me, 'Kind geändert', `${child.username}: ${JSON.stringify(body)}`);
  res.json({ child: publicUser(findUser(child.id)!) });
});

childrenRouter.post('/:id/password', async (req, res) => {
  const me = currentUser(res);
  const child = findChild(idParam(req));
  const { password } = parse(z.object({ password: zPassword }), req.body);
  await setPassword(child, password);
  audit(me, 'Kinder-Passwort zurückgesetzt', child.username);
  res.json({ ok: true });
});

childrenRouter.post('/:id/unlock', (req, res) => {
  const me = currentUser(res);
  const child = findChild(idParam(req));
  run('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', child.id);
  audit(me, 'Kinderkonto entsperrt', child.username);
  res.json({ ok: true });
});

childrenRouter.delete('/:id', (req, res) => {
  const me = currentUser(res);
  const child = findChild(idParam(req));
  run('DELETE FROM users WHERE id = ?', child.id); // Lernstand & Zuteilungen werden automatisch mitgelöscht
  audit(me, 'Kind gelöscht', `${child.display_name} (${child.username})`);
  res.json({ ok: true });
});

export function setChildDecks(childId: number, deckIds: number[], actorId: number): void {
  transaction(() => {
    const wanted = new Set(deckIds);
    for (const d of all<{ deck_id: number }>('SELECT deck_id FROM deck_assignments WHERE child_id = ?', childId)) {
      if (!wanted.has(d.deck_id)) run('DELETE FROM deck_assignments WHERE child_id = ? AND deck_id = ?', childId, d.deck_id);
    }
    for (const deckId of wanted) {
      if (!one('SELECT 1 FROM decks WHERE id = ?', deckId)) throw notFound('Kartenstapel');
      run('INSERT OR IGNORE INTO deck_assignments (deck_id, child_id, assigned_at, assigned_by) VALUES (?, ?, ?, ?)', deckId, childId, now(), actorId);
    }
  });
}

childrenRouter.put('/:id/decks', (req, res) => {
  const me = currentUser(res);
  const child = findChild(idParam(req));
  const { deckIds } = parse(z.object({ deckIds: z.array(z.number().int().positive()) }), req.body);
  setChildDecks(child.id, deckIds, me.id);
  audit(me, 'Stapel zugeteilt', `${child.username}: ${deckIds.join(', ') || 'keine'}`);
  res.json({ decks: assignedDecks(child.id) });
});

childrenRouter.get('/:id/decks/:deckId', (req, res) => {
  const child = findChild(idParam(req));
  const deckId = idParam(req, 'deckId');
  const deck = one<{ id: number; title: string }>('SELECT id, title FROM decks WHERE id = ?', deckId);
  if (!deck) throw notFound('Kartenstapel');
  res.json({ deck, progress: progressSummary(child.id, deck.id), cards: cardStatistics(child.id, deck.id) });
});

childrenRouter.post('/:id/decks/:deckId/reset', (req, res) => {
  const me = currentUser(res);
  const child = findChild(idParam(req));
  const deckId = idParam(req, 'deckId');
  resetProgress(child.id, deckId);
  audit(me, 'Lernstand zurückgesetzt', `${child.username}, Stapel #${deckId}`);
  res.json({ ok: true });
});
