import { Router } from 'express';
import { z } from 'zod';
import { all, now, one, run, transaction } from '../db.ts';
import { audit } from '../lib/audit.ts';
import { cardForStaff, cardInputSchema, normalizeCardInput, type CardRow } from '../lib/cards.ts';
import { HttpError, idParam, notFound, parse } from '../lib/http.ts';
import { assertImagesExist, deleteIfUnused } from '../lib/images.ts';
import { progressSummary } from '../lib/study.ts';
import { currentUser, requireStaff } from '../security/sessions.ts';

/** Kartenstapel und Karten bearbeiten – für alle Betreuer. */
export const decksRouter = Router();
decksRouter.use(requireStaff);

interface DeckRow {
  id: number;
  title: string;
  description: string;
  created_at: string;
  updated_at: string;
}

const deckSchema = z.object({
  title: z.string({ error: 'Titel fehlt.' }).trim().min(1, 'Bitte einen Titel angeben.').max(120, 'Der Titel ist zu lang.'),
  description: z.string().trim().max(1000, 'Die Beschreibung ist zu lang.').default(''),
});

function findDeck(id: number): DeckRow {
  const deck = one<DeckRow>('SELECT * FROM decks WHERE id = ?', id);
  if (!deck) throw notFound('Kartenstapel');
  return deck;
}

function touchDeck(id: number): void {
  run('UPDATE decks SET updated_at = ? WHERE id = ?', now(), id);
}

function deckJson(d: DeckRow) {
  return { id: d.id, title: d.title, description: d.description, createdAt: d.created_at, updatedAt: d.updated_at };
}

decksRouter.get('/', (_req, res) => {
  const rows = all<DeckRow & { card_count: number; child_count: number }>(
    `SELECT d.*,
            (SELECT COUNT(*) FROM cards c WHERE c.deck_id = d.id) AS card_count,
            (SELECT COUNT(*) FROM deck_assignments a WHERE a.deck_id = d.id) AS child_count
       FROM decks d ORDER BY d.title COLLATE NOCASE`,
  );
  res.json({ decks: rows.map((d) => ({ ...deckJson(d), cardCount: d.card_count, childCount: d.child_count })) });
});

decksRouter.post('/', (req, res) => {
  const me = currentUser(res);
  const body = parse(deckSchema, req.body);
  const ts = now();
  const { lastInsertRowid } = run('INSERT INTO decks (title, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    body.title, body.description, me.id, ts, ts);
  audit(me, 'Stapel angelegt', body.title);
  res.status(201).json({ deck: deckJson(findDeck(lastInsertRowid)) });
});

decksRouter.get('/:id', (req, res) => {
  const deck = findDeck(idParam(req));
  const cards = all<CardRow>('SELECT * FROM cards WHERE deck_id = ? ORDER BY position', deck.id);
  const children = all<{ id: number; display_name: string; username: string }>(
    `SELECT u.id, u.display_name, u.username FROM deck_assignments a JOIN users u ON u.id = a.child_id
      WHERE a.deck_id = ? ORDER BY u.display_name COLLATE NOCASE`,
    deck.id,
  );
  res.json({
    deck: deckJson(deck),
    cards: cards.map(cardForStaff),
    children: children.map((c) => ({ id: c.id, displayName: c.display_name, username: c.username, progress: progressSummary(c.id, deck.id) })),
  });
});

decksRouter.patch('/:id', (req, res) => {
  const me = currentUser(res);
  const deck = findDeck(idParam(req));
  const body = parse(deckSchema, req.body);
  run('UPDATE decks SET title = ?, description = ?, updated_at = ? WHERE id = ?', body.title, body.description, now(), deck.id);
  audit(me, 'Stapel geändert', body.title);
  res.json({ deck: deckJson(findDeck(deck.id)) });
});

decksRouter.delete('/:id', (req, res) => {
  const me = currentUser(res);
  const deck = findDeck(idParam(req));
  const images = all<{ q: string | null; a: string | null }>('SELECT question_image AS q, answer_image AS a FROM cards WHERE deck_id = ?', deck.id);
  run('DELETE FROM decks WHERE id = ?', deck.id);
  deleteIfUnused(...images.flatMap((i) => [i.q, i.a]));
  audit(me, 'Stapel gelöscht', deck.title);
  res.json({ ok: true });
});

/** Kopie eines Stapels, z. B. als Grundlage für eine andere Ausbildung. Bilder werden gemeinsam genutzt. */
decksRouter.post('/:id/duplicate', (req, res) => {
  const me = currentUser(res);
  const deck = findDeck(idParam(req));
  const newId = transaction(() => {
    const ts = now();
    const { lastInsertRowid } = run('INSERT INTO decks (title, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      `${deck.title} (Kopie)`.slice(0, 120), deck.description, me.id, ts, ts);
    run(
      `INSERT INTO cards (deck_id, position, type, question, question_image, answer, answer_image, accepted_answers, case_sensitive, options, created_at, updated_at)
       SELECT ?, position, type, question, question_image, answer, answer_image, accepted_answers, case_sensitive, options, ?, ?
         FROM cards WHERE deck_id = ?`,
      lastInsertRowid, ts, ts, deck.id,
    );
    return lastInsertRowid;
  });
  audit(me, 'Stapel kopiert', deck.title);
  res.status(201).json({ deck: deckJson(findDeck(newId)) });
});

decksRouter.put('/:id/children', (req, res) => {
  const me = currentUser(res);
  const deck = findDeck(idParam(req));
  const { childIds } = parse(z.object({ childIds: z.array(z.number().int().positive()) }), req.body);
  transaction(() => {
    const wanted = new Set(childIds);
    for (const a of all<{ child_id: number }>('SELECT child_id FROM deck_assignments WHERE deck_id = ?', deck.id)) {
      if (!wanted.has(a.child_id)) run('DELETE FROM deck_assignments WHERE deck_id = ? AND child_id = ?', deck.id, a.child_id);
    }
    for (const childId of wanted) {
      if (!one("SELECT 1 FROM users WHERE id = ? AND role = 'kind'", childId)) throw notFound('Kind');
      run('INSERT OR IGNORE INTO deck_assignments (deck_id, child_id, assigned_at, assigned_by) VALUES (?, ?, ?, ?)', deck.id, childId, now(), me.id);
    }
  });
  audit(me, 'Kinder zugeteilt', `${deck.title}: ${childIds.length} Kind(er)`);
  res.json({ ok: true });
});

// ---------- Karten ----------

decksRouter.post('/:id/cards', (req, res) => {
  const me = currentUser(res);
  const deck = findDeck(idParam(req));
  const card = normalizeCardInput(parse(cardInputSchema, req.body));
  assertImagesExist(card.questionImage, card.answerImage);
  const ts = now();
  const position = one<{ p: number }>('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM cards WHERE deck_id = ?', deck.id)!.p;
  const { lastInsertRowid } = run(
    `INSERT INTO cards (deck_id, position, type, question, question_image, answer, answer_image, accepted_answers, case_sensitive, options, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    deck.id, position, card.type, card.question, card.questionImage, card.answer, card.answerImage,
    JSON.stringify(card.acceptedAnswers), card.caseSensitive ? 1 : 0, JSON.stringify(card.options), ts, ts,
  );
  touchDeck(deck.id);
  audit(me, 'Karte angelegt', `${deck.title}: ${card.question.slice(0, 60)}`);
  res.status(201).json({ card: cardForStaff(one<CardRow>('SELECT * FROM cards WHERE id = ?', lastInsertRowid)!) });
});

decksRouter.put('/:id/order', (req, res) => {
  const deck = findDeck(idParam(req));
  const { cardIds } = parse(z.object({ cardIds: z.array(z.number().int().positive()) }), req.body);
  const existing = all<{ id: number }>('SELECT id FROM cards WHERE deck_id = ?', deck.id).map((c) => c.id);
  if (existing.length !== cardIds.length || !existing.every((id) => cardIds.includes(id))) {
    throw new HttpError(409, 'Die Kartenliste hat sich geändert. Bitte die Seite neu laden.');
  }
  transaction(() => cardIds.forEach((id, i) => run('UPDATE cards SET position = ? WHERE id = ?', i + 1, id)));
  touchDeck(deck.id);
  res.json({ ok: true });
});

export const cardsRouter = Router();
cardsRouter.use(requireStaff);

function findCard(id: number): CardRow {
  const card = one<CardRow>('SELECT * FROM cards WHERE id = ?', id);
  if (!card) throw notFound('Karte');
  return card;
}

cardsRouter.patch('/:id', (req, res) => {
  const me = currentUser(res);
  const old = findCard(idParam(req));
  const card = normalizeCardInput(parse(cardInputSchema, req.body));
  assertImagesExist(card.questionImage, card.answerImage);
  run(
    `UPDATE cards SET type = ?, question = ?, question_image = ?, answer = ?, answer_image = ?,
            accepted_answers = ?, case_sensitive = ?, options = ?, updated_at = ? WHERE id = ?`,
    card.type, card.question, card.questionImage, card.answer, card.answerImage,
    JSON.stringify(card.acceptedAnswers), card.caseSensitive ? 1 : 0, JSON.stringify(card.options), now(), old.id,
  );
  deleteIfUnused(old.question_image, old.answer_image);
  touchDeck(old.deck_id);
  audit(me, 'Karte geändert', `#${old.id}: ${card.question.slice(0, 60)}`);
  res.json({ card: cardForStaff(findCard(old.id)) });
});

cardsRouter.delete('/:id', (req, res) => {
  const me = currentUser(res);
  const card = findCard(idParam(req));
  run('DELETE FROM cards WHERE id = ?', card.id);
  deleteIfUnused(card.question_image, card.answer_image);
  touchDeck(card.deck_id);
  audit(me, 'Karte gelöscht', `#${card.id}: ${card.question.slice(0, 60)}`);
  res.json({ ok: true });
});
