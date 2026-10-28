import { createHash, randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.ts';
import { now, one, run } from '../db.ts';

export type Role = 'admin' | 'betreuer' | 'kind';

export interface SessionUser {
  id: number;
  role: Role;
  username: string;
  displayName: string;
}

export const COOKIE_NAME = 'kk_session';

/**
 * In der Datenbank liegt nur ein SHA-256-Fingerabdruck des Anmelde-Tokens.
 * Selbst wer die Datenbank kopiert, kann sich damit nicht als jemand anderes anmelden.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionLifetimeMs(role: Role): number {
  return role === 'kind'
    ? config.sessionDaysChild * 24 * 60 * 60 * 1000
    : config.sessionHoursStaff * 60 * 60 * 1000;
}

export function createSession(userId: number, role: Role, userAgent: string | undefined): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionLifetimeMs(role));
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

function readToken(req: Request): string | undefined {
  const auth = req.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim() || undefined;
  const cookie = req.get('cookie');
  if (!cookie) return undefined;
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, // JavaScript im Browser kommt nicht an das Token heran
    secure: config.cookieSecure, // nur über HTTPS
    sameSite: 'strict', // wird von fremden Webseiten aus nie mitgeschickt
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: config.cookieSecure, sameSite: 'strict', path: '/' });
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
  const token = readToken(req);
  if (!token) return next();
  const tokenHash = hashToken(token);
  const row = one<SessionRow>(
    `SELECT s.user_id, s.expires_at, s.last_seen_at, u.role, u.username, u.display_name, u.active
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
    tokenHash,
  );
  if (!row || row.active !== 1 || row.expires_at < now()) {
    if (row) run('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
    return next();
  }
  if (Date.now() - Date.parse(row.last_seen_at) > 60_000) {
    run('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?', now(), tokenHash);
  }
  res.locals.user = { id: row.user_id, role: row.role, username: row.username, displayName: row.display_name } satisfies SessionUser;
  res.locals.token = token;
  next();
}

export function currentUser(res: Response): SessionUser {
  const user = res.locals.user as SessionUser | undefined;
  if (!user) throw new Error('currentUser() ohne Anmeldung aufgerufen');
  return user;
}

export function requireRole(...roles: Role[]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const user = res.locals.user as SessionUser | undefined;
    if (!user) {
      res.status(401).json({ error: 'Bitte melde dich an.' });
      return;
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ error: 'Dafür fehlt die Berechtigung.' });
      return;
    }
    next();
  };
}

export const requireStaff = requireRole('admin', 'betreuer');
export const requireAdmin = requireRole('admin');
export const requireChild = requireRole('kind');
export const requireAnyUser = requireRole('admin', 'betreuer', 'kind');
