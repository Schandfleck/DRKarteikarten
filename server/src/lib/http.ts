import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { requestLanguage, translate } from './i18n.ts';

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

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const send = (status: number, message: string) => {
    res.status(status).json({ error: translate(message, requestLanguage(req), status) });
  };
  if (err instanceof HttpError) return send(err.status, err.message);
  const status = (err as { status?: number; type?: string }).status;
  if (status === 413) return send(413, 'Die Datei ist zu groß.');
  if (status === 400) return send(400, 'Ungültige Anfrage.');
  console.error(err);
  send(500, 'Interner Fehler. Bitte später erneut versuchen.');
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
