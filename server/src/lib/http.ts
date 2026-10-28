import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const notFound = (what = 'Eintrag') => new HttpError(404, `${what} nicht gefunden.`);

/** Prüft eingehende Daten gegen ein Schema; bei Fehlern gibt es eine verständliche Meldung (HTTP 400). */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpError(400, issue?.message ?? 'Ungültige Eingabe.');
  }
  return result.data;
}

export function idParam(req: Request, name = 'id'): number {
  const id = Number(req.params[name]);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound();
  return id;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  const status = (err as { status?: number; type?: string }).status;
  if (status === 413) {
    res.status(413).json({ error: 'Die Datei ist zu groß.' });
    return;
  }
  if (status === 400) {
    res.status(400).json({ error: 'Ungültige Anfrage.' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Interner Fehler. Bitte später erneut versuchen.' });
}

// Wiederverwendbare Bausteine für Eingaben
export const zUsername = z
  .string({ error: 'Benutzername fehlt.' })
  .trim()
  .toLowerCase()
  .min(3, 'Der Benutzername muss mindestens 3 Zeichen lang sein.')
  .max(32, 'Der Benutzername darf höchstens 32 Zeichen lang sein.')
  .regex(/^[a-z0-9][a-z0-9._-]*$/, 'Der Benutzername darf nur Kleinbuchstaben, Ziffern sowie . _ - enthalten.');

export const zDisplayName = z
  .string({ error: 'Name fehlt.' })
  .trim()
  .min(1, 'Bitte einen Namen angeben.')
  .max(80, 'Der Name ist zu lang.');

export const zPassword = z.string({ error: 'Passwort fehlt.' }).max(200, 'Das Passwort ist zu lang.');
