import { createHash, randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.ts';
import { now, one, run } from '../db.ts';
import { requestLanguage, translate } from '../lib/i18n.ts';

export type Role = 'admin' | 'betreuer' | 'kind';

export interface SessionUser {
  id: number;
  role: Role;
  username: string;
  displayName: string;
}

/**
 * Getrennte Cookies für Betreuer und Kinder: So bleiben beide Anmeldungen im selben Browser bestehen
 * (z. B. ein Betreuer, der kurz die Kinder-App ausprobiert, fliegt nicht aus der Betreuer-Website).
 * Jede Oberfläche schickt den Header "X-KK-App" mit, damit der Server das passende Cookie nimmt.
 */
export type AppName = 'betreuer' | 'kinder';
const COOKIE_FOR_APP: Record<AppName, string> = { betreuer: 'kk_staff', kinder: 'kk_kind' };
export const APP_HEADER = 'x-kk-app';

export function appForRole(role: Role): AppName {
  return role === 'kind' ? 'kinder' : 'betreuer';
}

function requestedApp(req: Request): AppName | undefined {
  const app = req.get(APP_HEADER);
  return app === 'betreuer' || app === 'kinder' ? app : undefined;
}

/**
 * In der Datenbank liegt nur ein SHA-256-Fingerabdruck des Anmelde-Tokens.
 * Selbst wer die Datenbank kopiert, kann sich damit nicht als jemand anderes anmelden.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Kinder ohne "Angemeldet bleiben": höchstens so lange gültig, auch wenn das Gerät die App nie richtig schließt. */
const CHILD_SHORT_SESSION_MS = 2 * 60 * 60 * 1000;

export function sessionLifetimeMs(role: Role, remember = true): number {
  if (role !== 'kind') return config.sessionHoursStaff * 60 * 60 * 1000;
  return remember ? config.sessionDaysChild * 24 * 60 * 60 * 1000 : CHILD_SHORT_SESSION_MS;
}

export function createSession(userId: number, role: Role, userAgent: string | undefined, remember = true): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionLifetimeMs(role, remember));
  const ts = now();
  run(
    'INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
    hashToken(token), userId, ts, ts, expiresAt.toISOString(), (userAgent ?? '').slice(0, 300),
  );
  return { token, expiresAt };
}

export function deleteSession(token: string): void {
  run('DELETE FROM sessions WHERE token_hash = ?', hashToken(token));
}

/** Meldet einen Benutzer überall ab (z. B. nach Passwort-Reset oder Deaktivierung). */
export function deleteUserSessions(userId: number, exceptToken?: string): void {
  if (exceptToken) run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', userId, hashToken(exceptToken));
  else run('DELETE FROM sessions WHERE user_id = ?', userId);
}

export function purgeExpiredSessions(): void {
  run('DELETE FROM sessions WHERE expires_at < ?', now());
}

function readCookies(req: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (req.get('cookie') ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name) cookies.set(name, decodeURIComponent(rest.join('=')));
  }
  return cookies;
}

/**
 * Mögliche Anmelde-Tokens dieser Anfrage, in der Reihenfolge, in der sie probiert werden.
 * Ohne X-KK-App-Header (z. B. beim Laden eines Bildes über <img>) gilt erst die Betreuer-, dann die Kinder-Anmeldung.
 */
function candidateTokens(req: Request): string[] {
  const auth = req.get('authorization');
  if (auth?.startsWith('Bearer ')) return [auth.slice(7).trim()].filter(Boolean);
  const cookies = readCookies(req);
  const app = requestedApp(req);
  const apps: AppName[] = app ? [app] : ['betreuer', 'kinder'];
  return apps.map((a) => cookies.get(COOKIE_FOR_APP[a])).filter((t): t is string => !!t);
}

/** persistent = false: Cookie ohne Ablaufdatum, der Browser löscht es beim Schließen. */
export function setSessionCookie(res: Response, app: AppName, token: string, expiresAt: Date, persistent = true): void {
  res.cookie(COOKIE_FOR_APP[app], token, {
    httpOnly: true, // JavaScript im Browser kommt nicht an das Token heran
    secure: config.cookieSecure, // nur über HTTPS
    sameSite: 'strict', // wird von fremden Webseiten aus nie mitgeschickt
    path: '/',
    ...(persistent ? { expires: expiresAt } : {}),
  });
}

export function clearSessionCookie(res: Response, app: AppName): void {
  res.clearCookie(COOKIE_FOR_APP[app], { httpOnly: true, secure: config.cookieSecure, sameSite: 'strict', path: '/' });
}

interface SessionRow {
  user_id: number;
  role: Role;
  username: string;
  display_name: string;
  expires_at: string;
  last_seen_at: string;
  active: number;
}

/** Liest die Anmeldung aus Cookie oder "Authorization: Bearer"-Header (für eine spätere native App). */
export function sessionMiddleware(req: Request, res: Response, next: NextFunction): void {
  for (const token of candidateTokens(req)) {
    const user = resolveSession(token);
    if (user) {
      res.locals.user = user;
      res.locals.token = token;
      break;
    }
  }
  next();
}

function resolveSession(token: string): SessionUser | undefined {
  const tokenHash = hashToken(token);
  const row = one<SessionRow>(
    `SELECT s.user_id, s.expires_at, s.last_seen_at, u.role, u.username, u.display_name, u.active
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
    tokenHash,
  );
  if (!row || row.active !== 1 || row.expires_at < now()) {
    if (row) run('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
    return undefined;
  }
  if (Date.now() - Date.parse(row.last_seen_at) > 60_000) {
    run('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?', now(), tokenHash);
  }
  return { id: row.user_id, role: row.role, username: row.username, displayName: row.display_name };
}

export function currentUser(res: Response): SessionUser {
  const user = res.locals.user as SessionUser | undefined;
  if (!user) throw new Error('currentUser() ohne Anmeldung aufgerufen');
  return user;
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = res.locals.user as SessionUser | undefined;
    if (!user) {
      res.status(401).json({ error: translate('Bitte melde dich an.', requestLanguage(req), 401) });
      return;
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ error: translate('Dafür fehlt die Berechtigung.', requestLanguage(req), 403) });
      return;
    }
    next();
  };
}

export const requireStaff = requireRole('admin', 'betreuer');
export const requireAdmin = requireRole('admin');
export const requireChild = requireRole('kind');
export const requireAnyUser = requireRole('admin', 'betreuer', 'kind');
