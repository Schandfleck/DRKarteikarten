// Typen der Server-Antworten (siehe server/src/routes/*)

export type Role = 'admin' | 'betreuer' | 'kind';
export type CardType = 'flip' | 'input' | 'choice';
export type ProgressStatus = 'neu' | 'in_arbeit' | 'abgeschlossen';

export interface User {
  id: number;
  role: Role;
  username: string;
  displayName: string;
  active: boolean;
  locked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface ChildListItem extends User {
  deckCount: number;
  decksFinished: number;
  lastActivityAt: string | null;
}

export interface Progress {
  status: ProgressStatus;
  totalCards: number;
  solved: number;
  round: number;
  completions: number;
  lastActivityAt: string | null;
  finishedAt: string | null;
}

export interface Deck {
  id: number;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeckListItem extends Deck {
  cardCount: number;
  childCount: number;
}

export interface ChoiceOption {
  id?: string;
  text: string;
  correct: boolean;
}

export interface Card {
  id: number;
  deckId: number;
  position: number;
  type: CardType;
  question: string;
  questionImage: string | null;
  answer: string;
  answerImage: string | null;
  acceptedAnswers: string[];
  caseSensitive: boolean;
  options: ChoiceOption[];
  updatedAt: string;
}

export type CardInput = Omit<Card, 'id' | 'deckId' | 'position' | 'updatedAt'>;

export interface CardStat {
  cardId: number;
  type: CardType;
  question: string;
  questionImage: string | null;
  solved: boolean;
  attempts: number;
  wrong: number;
  wrongTotal: number;
}

export interface AuditEntry {
  id: number;
  at: string;
  actor: string;
  action: string;
  details: string;
}

// ---------- Anfragen ----------

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Wird ausgelöst, wenn die Anmeldung abgelaufen ist – die App zeigt dann wieder die Anmeldeseite. */
export const SESSION_EXPIRED = 'kk:session-expired';

async function request<T>(method: string, path: string, body?: unknown, contentType = 'application/json'): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: { 'x-kk-app': 'betreuer', ...(body !== undefined ? { 'content-type': contentType } : {}) },
      body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Keine Verbindung zum Server. Bitte Internetverbindung prüfen.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event(SESSION_EXPIRED));
    throw new ApiError(res.status, (data as { error?: string }).error ?? `Fehler ${res.status}`);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload: (file: File) => request<{ id: string }>('POST', '/uploads', file, file.type || 'application/octet-stream'),
};

export const imageUrl = (id: string) => `/api/uploads/${id}`;

export function formatDate(iso: string | null | undefined, withTime = true): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return withTime
    ? d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  flip: 'Vorder-/Rückseite',
  input: 'Antwort eintippen',
  choice: 'Multiple Choice',
};

export const ROLE_LABELS: Record<Role, string> = { admin: 'Admin', betreuer: 'Betreuer', kind: 'Kind' };

/** Schlägt aus einem Namen einen Benutzernamen vor: "Max Müller" → "max.mueller" */
export function suggestUsername(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 32);
}
