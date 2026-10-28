// Schnittstelle zum Server (siehe server/src/routes/child.ts)

export type CardType = 'flip' | 'input' | 'choice';

export interface User {
  id: number;
  role: 'admin' | 'betreuer' | 'kind';
  username: string;
  displayName: string;
}

export interface Progress {
  status: 'neu' | 'in_arbeit' | 'abgeschlossen';
  totalCards: number;
  solved: number;
  round: number;
  completions: number;
}

export interface Deck {
  id: number;
  title: string;
  description: string;
  progress: Progress;
}

export interface StudyCard {
  id: number;
  type: CardType;
  question: string;
  questionImage: string | null;
  answer?: string;
  answerImage?: string | null;
  options?: { id: string; text: string }[];
  multiple?: boolean;
}

export interface Summary {
  rounds: number;
  cards: number;
  attempts: number;
  wrong: number;
}

export type Session =
  | { status: 'empty' }
  | { status: 'finished'; summary: Summary }
  | { status: 'active'; round: number; total: number; solved: number; roundSize: number; cards: StudyCard[] };

export interface AnswerResult {
  correct: boolean;
  solution: { answer: string; answerImage: string | null; acceptedAnswers?: string[]; correctOptionIds?: string[] };
  progress: { total: number; solved: number; round: number };
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const SESSION_EXPIRED = 'kk:session-expired';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Keine Internetverbindung. Bitte prüfe das WLAN.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event(SESSION_EXPIRED));
    throw new ApiError(res.status, (data as { error?: string }).error ?? 'Etwas ist schiefgelaufen.');
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
};

export const imageUrl = (id: string) => `/api/uploads/${id}`;

export function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
