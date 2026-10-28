import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from './http.ts';

export type CardType = 'flip' | 'input' | 'choice';

export interface ChoiceOption {
  id: string;
  text: string;
  correct: boolean;
}

export interface CardRow {
  id: number;
  deck_id: number;
  position: number;
  type: CardType;
  question: string;
  question_image: string | null;
  answer: string;
  answer_image: string | null;
  accepted_answers: string;
  case_sensitive: number;
  options: string;
  created_at: string;
  updated_at: string;
}

const zImageId = z.string().regex(/^[a-f0-9]{32}$/, 'Ungültiges Bild.').nullable().default(null);

export const cardInputSchema = z.object({
  type: z.enum(['flip', 'input', 'choice'], { error: 'Bitte einen Kartentyp wählen.' }),
  question: z.string().trim().max(2000, 'Die Frage ist zu lang (max. 2000 Zeichen).').default(''),
  questionImage: zImageId,
  answer: z.string().trim().max(4000, 'Der Antwort-/Erklärungstext ist zu lang (max. 4000 Zeichen).').default(''),
  answerImage: zImageId,
  acceptedAnswers: z.array(z.string().trim().max(300, 'Eine Antwort ist zu lang.')).max(20, 'Höchstens 20 richtige Schreibweisen.').default([]),
  caseSensitive: z.boolean().default(false),
  options: z
    .array(z.object({
      id: z.string().max(20).optional(),
      text: z.string().trim().max(500, 'Eine Antwortmöglichkeit ist zu lang.'),
      correct: z.boolean(),
    }))
    .max(10, 'Höchstens 10 Antwortmöglichkeiten.')
    .default([]),
});

export type CardInput = z.infer<typeof cardInputSchema>;

/** Prüft die Regeln je Kartentyp und räumt nicht benötigte Felder auf. */
export function normalizeCardInput(input: CardInput): CardInput & { options: ChoiceOption[] } {
  if (!input.question && !input.questionImage) throw new HttpError(400, 'Die Vorderseite braucht einen Text oder ein Bild.');

  const acceptedAnswers = [...new Set(input.acceptedAnswers.filter(Boolean))];
  const options: ChoiceOption[] = input.options
    .filter((o) => o.text)
    .map((o) => ({ id: o.id && /^[a-z0-9]+$/.test(o.id) ? o.id : randomBytes(4).toString('hex'), text: o.text, correct: o.correct }));

  switch (input.type) {
    case 'flip':
      if (!input.answer && !input.answerImage) throw new HttpError(400, 'Die Rückseite braucht einen Text oder ein Bild.');
      return { ...input, acceptedAnswers: [], caseSensitive: false, options: [] };
    case 'input':
      if (acceptedAnswers.length === 0) throw new HttpError(400, 'Bitte mindestens eine richtige Antwort eintragen.');
      return { ...input, acceptedAnswers, options: [] };
    case 'choice':
      if (options.length < 2) throw new HttpError(400, 'Bitte mindestens zwei Antwortmöglichkeiten eintragen.');
      if (!options.some((o) => o.correct)) throw new HttpError(400, 'Mindestens eine Antwortmöglichkeit muss richtig sein.');
      return { ...input, acceptedAnswers: [], caseSensitive: false, options };
  }
}

/** Vollständige Karte inkl. Lösungen – nur für Betreuer. */
export function cardForStaff(c: CardRow) {
  return {
    id: c.id,
    deckId: c.deck_id,
    position: c.position,
    type: c.type,
    question: c.question,
    questionImage: c.question_image,
    answer: c.answer,
    answerImage: c.answer_image,
    acceptedAnswers: JSON.parse(c.accepted_answers) as string[],
    caseSensitive: c.case_sensitive === 1,
    options: JSON.parse(c.options) as ChoiceOption[],
    updatedAt: c.updated_at,
  };
}

/**
 * Karte für die Kinder-App. Bei Eingabe- und Auswahlkarten wird die Lösung erst NACH dem Antworten
 * vom Server mitgeteilt – so kann sie vorher auch nicht im Browser "nachgeschaut" werden.
 */
export function cardForChild(c: CardRow) {
  const base = { id: c.id, type: c.type, question: c.question, questionImage: c.question_image };
  if (c.type === 'flip') return { ...base, answer: c.answer, answerImage: c.answer_image };
  if (c.type === 'choice') {
    const options = JSON.parse(c.options) as ChoiceOption[];
    return { ...base, options: options.map((o) => ({ id: o.id, text: o.text })), multiple: options.filter((o) => o.correct).length > 1 };
  }
  return base;
}

export function solutionFor(c: CardRow) {
  return {
    answer: c.answer,
    answerImage: c.answer_image,
    acceptedAnswers: c.type === 'input' ? (JSON.parse(c.accepted_answers) as string[]) : undefined,
    correctOptionIds: c.type === 'choice' ? (JSON.parse(c.options) as ChoiceOption[]).filter((o) => o.correct).map((o) => o.id) : undefined,
  };
}

export function normalizeAnswer(text: string, caseSensitive: boolean): string {
  const cleaned = text.normalize('NFC').trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim();
  return caseSensitive ? cleaned : cleaned.toLocaleLowerCase('de-DE');
}

export interface ChildAnswer {
  knew?: boolean;
  text?: string;
  optionIds?: string[];
}

export function isCorrect(c: CardRow, given: ChildAnswer): boolean {
  switch (c.type) {
    case 'flip':
      return given.knew === true;
    case 'input': {
      if (typeof given.text !== 'string') return false;
      const cs = c.case_sensitive === 1;
      const input = normalizeAnswer(given.text, cs);
      return input !== '' && (JSON.parse(c.accepted_answers) as string[]).some((a) => normalizeAnswer(a, cs) === input);
    }
    case 'choice': {
      const correct = new Set((JSON.parse(c.options) as ChoiceOption[]).filter((o) => o.correct).map((o) => o.id));
      const chosen = new Set(given.optionIds ?? []);
      return chosen.size === correct.size && [...chosen].every((id) => correct.has(id));
    }
  }
}
