import { Router } from 'express';
import { z } from 'zod';
import { all } from '../db.ts';
import { idParam, parse } from '../lib/http.ts';
import { answerCard, assertAssigned, loadStudySession, progressSummary, restartStudy } from '../lib/study.ts';
import { currentUser, requireChild } from '../security/sessions.ts';

/** Schnittstelle für die Kinder-App (PWA, später auch native App). */
export const childRouter = Router();
childRouter.use(requireChild);

childRouter.get('/decks', (_req, res) => {
  const me = currentUser(res);
  const decks = all<{ id: number; title: string; description: string }>(
    `SELECT d.id, d.title, d.description FROM deck_assignments a JOIN decks d ON d.id = a.deck_id
      WHERE a.child_id = ? ORDER BY d.title COLLATE NOCASE`,
    me.id,
  );
  res.json({ decks: decks.map((d) => ({ ...d, progress: progressSummary(me.id, d.id) })) });
});

childRouter.get('/decks/:deckId/session', (req, res) => {
  const me = currentUser(res);
  const deckId = idParam(req, 'deckId');
  assertAssigned(me.id, deckId);
  res.json(loadStudySession(me.id, deckId));
});

const answerSchema = z.object({
  cardId: z.number().int().positive(),
  knew: z.boolean().optional(),
  text: z.string().max(500).optional(),
  optionIds: z.array(z.string().max(20)).max(10).optional(),
});

childRouter.post('/decks/:deckId/answer', (req, res) => {
  const me = currentUser(res);
  const deckId = idParam(req, 'deckId');
  assertAssigned(me.id, deckId);
  const { cardId, ...given } = parse(answerSchema, req.body);
  res.json(answerCard(me.id, deckId, cardId, given));
});

childRouter.post('/decks/:deckId/restart', (req, res) => {
  const me = currentUser(res);
  const deckId = idParam(req, 'deckId');
  assertAssigned(me.id, deckId);
  restartStudy(me.id, deckId);
  res.json(loadStudySession(me.id, deckId));
});
