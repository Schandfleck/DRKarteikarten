import { all, now, one, run, transaction } from '../db.ts';
import { cardForChild, isCorrect, solutionFor, type CardRow, type ChildAnswer } from './cards.ts';
import { HttpError } from './http.ts';

/*
 * Lernablauf "Runden, bis alles richtig ist":
 *  - Runde 1: alle Karten des Stapels.
 *  - Jede richtig beantwortete Karte ist erledigt.
 *  - Ist eine Runde durch, beginnt die nächste mit allen noch nicht erledigten Karten.
 *  - Sind alle Karten erledigt, ist der Durchgang abgeschlossen.
 * Der Stand liegt auf dem Server – wer die App schließt, macht später genau dort weiter.
 */

interface RunRow {
  id: number;
  child_id: number;
  deck_id: number;
  round: number;
  started_at: string;
  last_activity_at: string;
  finished_at: string | null;
}

function activeRun(childId: number, deckId: number): RunRow | undefined {
  return one<RunRow>('SELECT * FROM study_runs WHERE child_id = ? AND deck_id = ? AND finished_at IS NULL', childId, deckId);
}

function latestRun(childId: number, deckId: number): RunRow | undefined {
  return one<RunRow>('SELECT * FROM study_runs WHERE child_id = ? AND deck_id = ? ORDER BY id DESC LIMIT 1', childId, deckId);
}

function createRun(childId: number, deckId: number): RunRow {
  const ts = now();
  const { lastInsertRowid } = run(
    'INSERT INTO study_runs (child_id, deck_id, round, started_at, last_activity_at) VALUES (?, ?, 1, ?, ?)',
    childId, deckId, ts, ts,
  );
  return one<RunRow>('SELECT * FROM study_runs WHERE id = ?', lastInsertRowid)!;
}

/** Neu hinzugefügte Karten werden in einen laufenden Durchgang aufgenommen. */
function syncRunCards(r: RunRow): void {
  run('INSERT OR IGNORE INTO run_cards (run_id, card_id) SELECT ?, id FROM cards WHERE deck_id = ?', r.id, r.deck_id);
}

function counts(runId: number): { total: number; solved: number } {
  return one<{ total: number; solved: number }>(
    'SELECT COUNT(*) AS total, COALESCE(SUM(solved), 0) AS solved FROM run_cards WHERE run_id = ?',
    runId,
  )!;
}

export function assertAssigned(childId: number, deckId: number): void {
  if (!one('SELECT 1 FROM deck_assignments WHERE child_id = ? AND deck_id = ?', childId, deckId)) {
    throw new HttpError(404, 'Dieser Kartenstapel ist dir nicht zugeteilt.');
  }
}

export function finishedSummary(r: RunRow) {
  const stats = one<{ total: number; attempts: number; wrong: number }>(
    'SELECT COUNT(*) AS total, COALESCE(SUM(attempts), 0) AS attempts, COALESCE(SUM(wrong), 0) AS wrong FROM run_cards WHERE run_id = ?',
    r.id,
  )!;
  return { rounds: r.round, cards: stats.total, attempts: stats.attempts, wrong: stats.wrong, finishedAt: r.finished_at };
}

/** Liefert die Karten, die in der aktuellen Runde noch dran sind (und startet ggf. die nächste Runde). */
export function loadStudySession(childId: number, deckId: number) {
  return transaction(() => {
    const deckCards = one<{ n: number }>('SELECT COUNT(*) AS n FROM cards WHERE deck_id = ?', deckId)!.n;
    if (deckCards === 0) return { status: 'empty' as const };

    let r = activeRun(childId, deckId);
    if (!r) {
      const last = latestRun(childId, deckId);
      if (last?.finished_at) return { status: 'finished' as const, summary: finishedSummary(last) };
      r = createRun(childId, deckId);
    }
    syncRunCards(r);

    const pendingSql = `SELECT c.* FROM run_cards rc JOIN cards c ON c.id = rc.card_id
                         WHERE rc.run_id = ? AND rc.solved = 0 AND rc.last_round < ? ORDER BY c.position`;
    let pending = all<CardRow>(pendingSql, r.id, r.round);
    const { total, solved } = counts(r.id);

    if (pending.length === 0) {
      if (solved === total) {
        run('UPDATE study_runs SET finished_at = ? WHERE id = ?', now(), r.id);
        return { status: 'finished' as const, summary: finishedSummary(one<RunRow>('SELECT * FROM study_runs WHERE id = ?', r.id)!) };
      }
      r.round += 1;
      run('UPDATE study_runs SET round = ? WHERE id = ?', r.round, r.id);
      pending = all<CardRow>(pendingSql, r.id, r.round);
    }

    // Karten dieser Runde = noch offene + die in dieser Runde schon richtig beantworteten
    const roundSize = one<{ n: number }>(
      'SELECT COUNT(*) AS n FROM run_cards WHERE run_id = ? AND (solved = 0 OR last_round = ?)',
      r.id, r.round,
    )!.n;

    return {
      status: 'active' as const,
      round: r.round,
      total,
      solved,
      roundSize,
      cards: pending.map(cardForChild),
    };
  });
}

/** Wertet eine Antwort aus und speichert das Ergebnis. */
export function answerCard(childId: number, deckId: number, cardId: number, given: ChildAnswer) {
  return transaction(() => {
    const r = activeRun(childId, deckId);
    if (!r) throw new HttpError(409, 'Es läuft gerade kein Lerndurchgang. Bitte neu laden.');
    const card = one<CardRow>('SELECT * FROM cards WHERE id = ? AND deck_id = ?', cardId, deckId);
    if (!card) throw new HttpError(404, 'Diese Karte gibt es nicht mehr. Bitte neu laden.');
    syncRunCards(r);
    const rc = one<{ solved: number; last_round: number }>('SELECT solved, last_round FROM run_cards WHERE run_id = ? AND card_id = ?', r.id, card.id)!;

    const correct = isCorrect(card, given);
    const alreadyAnswered = rc.solved === 1 || rc.last_round >= r.round;
    if (!alreadyAnswered) {
      run(
        `UPDATE run_cards SET attempts = attempts + 1, wrong = wrong + ?, solved = ?, last_round = ?
          WHERE run_id = ? AND card_id = ?`,
        correct ? 0 : 1, correct ? 1 : 0, r.round, r.id, card.id,
      );
      run('UPDATE study_runs SET last_activity_at = ? WHERE id = ?', now(), r.id);
    }
    const { total, solved } = counts(r.id);
    return { correct, solution: solutionFor(card), progress: { total, solved, round: r.round } };
  });
}

/** Beginnt den Stapel von vorne (z. B. nach dem Abschluss zum Wiederholen). */
export function restartStudy(childId: number, deckId: number): void {
  transaction(() => {
    run('DELETE FROM study_runs WHERE child_id = ? AND deck_id = ? AND finished_at IS NULL', childId, deckId);
    createRun(childId, deckId);
  });
}

/** Setzt den gesamten Lernstand eines Kindes für einen Stapel zurück (auch abgeschlossene Durchgänge). */
export function resetProgress(childId: number, deckId: number): void {
  run('DELETE FROM study_runs WHERE child_id = ? AND deck_id = ?', childId, deckId);
}

export type ProgressStatus = 'neu' | 'in_arbeit' | 'abgeschlossen';

/** Kurzübersicht für Listen: Status, wie viele Karten erledigt, wie oft abgeschlossen. */
export function progressSummary(childId: number, deckId: number) {
  const totalCards = one<{ n: number }>('SELECT COUNT(*) AS n FROM cards WHERE deck_id = ?', deckId)!.n;
  const completions = one<{ n: number }>(
    'SELECT COUNT(*) AS n FROM study_runs WHERE child_id = ? AND deck_id = ? AND finished_at IS NOT NULL', childId, deckId,
  )!.n;
  const r = latestRun(childId, deckId);
  if (!r) return { status: 'neu' as ProgressStatus, totalCards, solved: 0, round: 0, completions, lastActivityAt: null, finishedAt: null };
  const solved = one<{ n: number }>(
    'SELECT COUNT(*) AS n FROM run_cards rc JOIN cards c ON c.id = rc.card_id WHERE rc.run_id = ? AND rc.solved = 1', r.id,
  )!.n;
  return {
    status: (r.finished_at ? 'abgeschlossen' : 'in_arbeit') as ProgressStatus,
    totalCards,
    solved: r.finished_at ? totalCards : solved,
    round: r.round,
    completions,
    lastActivityAt: r.last_activity_at,
    finishedAt: r.finished_at,
  };
}

/** Details je Karte für Betreuer: Welche Karten machen dem Kind Schwierigkeiten? */
export function cardStatistics(childId: number, deckId: number) {
  const r = latestRun(childId, deckId);
  return all<{ id: number; type: string; question: string; question_image: string | null; solved: number | null; attempts: number | null; wrong: number | null; wrong_total: number }>(
    `SELECT c.id, c.type, c.question, c.question_image, rc.solved, rc.attempts, rc.wrong,
            (SELECT COALESCE(SUM(x.wrong), 0) FROM run_cards x JOIN study_runs sr ON sr.id = x.run_id
              WHERE x.card_id = c.id AND sr.child_id = ?) AS wrong_total
       FROM cards c LEFT JOIN run_cards rc ON rc.card_id = c.id AND rc.run_id = ?
      WHERE c.deck_id = ? ORDER BY c.position`,
    childId, r?.id ?? -1, deckId,
  ).map((c) => ({
    cardId: c.id,
    type: c.type,
    question: c.question,
    questionImage: c.question_image,
    solved: c.solved === 1,
    attempts: c.attempts ?? 0,
    wrong: c.wrong ?? 0,
    wrongTotal: c.wrong_total,
  }));
}
