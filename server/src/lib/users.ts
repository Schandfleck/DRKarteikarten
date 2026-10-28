import { now, one, run } from '../db.ts';
import { checkPasswordStrength, hashPassword } from '../security/passwords.ts';
import { deleteUserSessions, type Role } from '../security/sessions.ts';
import { HttpError } from './http.ts';
import type { Language } from './i18n.ts';

export interface UserRow {
  id: number;
  role: Role;
  username: string;
  display_name: string;
  active: number;
  failed_logins: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
  language: Language | null;
}

export const USER_COLUMNS = 'id, role, username, display_name, active, failed_logins, locked_until, last_login_at, created_at, language';

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    role: u.role,
    username: u.username,
    displayName: u.display_name,
    active: u.active === 1,
    locked: !!u.locked_until && u.locked_until > now(),
    lastLoginAt: u.last_login_at,
    createdAt: u.created_at,
    language: u.language,
  };
}

export function findUser(id: number): UserRow | undefined {
  return one<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, id);
}

export async function createUser(input: {
  role: Role;
  username: string;
  displayName: string;
  password: string;
  createdBy: number | null;
}): Promise<UserRow> {
  const problem = checkPasswordStrength(input.password, input.role);
  if (problem) throw new HttpError(400, problem);
  if (one('SELECT 1 FROM users WHERE username = ?', input.username)) {
    throw new HttpError(409, 'Dieser Benutzername ist schon vergeben.');
  }
  const hash = await hashPassword(input.password);
  const ts = now();
  const { lastInsertRowid } = run(
    `INSERT INTO users (role, username, display_name, password_hash, password_changed_at, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    input.role, input.username, input.displayName, hash, ts, ts, input.createdBy,
  );
  return findUser(lastInsertRowid)!;
}

/** Setzt ein neues Passwort, hebt eine Sperre auf und meldet alle Geräte ab. */
export async function setPassword(user: UserRow, password: string, keepToken?: string): Promise<void> {
  const problem = checkPasswordStrength(password, user.role);
  if (problem) throw new HttpError(400, problem);
  const hash = await hashPassword(password);
  run(
    'UPDATE users SET password_hash = ?, password_changed_at = ?, failed_logins = 0, locked_until = NULL WHERE id = ?',
    hash, now(), user.id,
  );
  deleteUserSessions(user.id, keepToken);
}
