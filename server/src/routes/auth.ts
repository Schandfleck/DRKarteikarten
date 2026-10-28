import { Router } from 'express';
import { z } from 'zod';
import { now, one, run } from '../db.ts';
import { audit } from '../lib/audit.ts';
import { HttpError, parse, zPassword } from '../lib/http.ts';
import { findUser, publicUser, setPassword } from '../lib/users.ts';
import { getDummyHash, verifyPassword } from '../security/passwords.ts';
import { RateLimiter } from '../security/rateLimit.ts';
import {
  clearSessionCookie, createSession, currentUser, deleteSession, requireAnyUser, requireStaff,
  setSessionCookie, type Role,
} from '../security/sessions.ts';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export const loginLimiter = new RateLimiter(30, 15 * 60 * 1000);

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().max(64),
  password: zPassword,
  /** "native" = spätere App aus dem App Store: bekommt das Token im Antworttext statt als Cookie. */
  client: z.enum(['web', 'native']).default('web'),
});

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  if (!loginLimiter.hit(req.ip ?? 'unknown')) {
    throw new HttpError(429, 'Zu viele Anmeldeversuche. Bitte in einigen Minuten erneut versuchen.');
  }
  const body = parse(loginSchema, req.body);
  const user = one<{ id: number; role: Role; password_hash: string; active: number; failed_logins: number; locked_until: string | null }>(
    'SELECT id, role, password_hash, active, failed_logins, locked_until FROM users WHERE username = ?',
    body.username,
  );
  const wrong = new HttpError(401, 'Benutzername oder Passwort ist falsch.');

  if (!user) {
    await verifyPassword(body.password, await getDummyHash()); // gleiche Antwortzeit wie bei echtem Konto
    throw wrong;
  }
  if (user.locked_until && user.locked_until > now()) {
    const minutes = Math.ceil((Date.parse(user.locked_until) - Date.now()) / 60000);
    throw new HttpError(429, `Zu viele Fehlversuche. Das Konto ist noch ${minutes} Minute(n) gesperrt.`);
  }
  if (!(await verifyPassword(body.password, user.password_hash))) {
    const failed = user.failed_logins + 1;
    if (failed >= MAX_FAILED) {
      run('UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?',
        new Date(Date.now() + LOCK_MINUTES * 60000).toISOString(), user.id);
      audit(null, 'Konto gesperrt', `Benutzer #${user.id} nach ${MAX_FAILED} Fehlversuchen`);
    } else {
      run('UPDATE users SET failed_logins = ? WHERE id = ?', failed, user.id);
    }
    throw wrong;
  }
  if (user.active !== 1) throw new HttpError(403, 'Dieses Konto ist deaktiviert. Bitte wende dich an einen Betreuer.');

  run('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?', now(), user.id);
  const session = createSession(user.id, user.role, req.get('user-agent'));
  const profile = publicUser(findUser(user.id)!);
  if (body.client === 'native') {
    res.json({ user: profile, token: session.token, expiresAt: session.expiresAt });
  } else {
    setSessionCookie(res, session.token, session.expiresAt);
    res.json({ user: profile });
  }
});

authRouter.post('/logout', (_req, res) => {
  const token = res.locals.token as string | undefined;
  if (token) deleteSession(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAnyUser, (_req, res) => {
  res.json({ user: publicUser(findUser(currentUser(res).id)!) });
});

const changePasswordSchema = z.object({ currentPassword: zPassword, newPassword: zPassword });

authRouter.post('/password', requireStaff, async (req, res) => {
  const me = currentUser(res);
  const body = parse(changePasswordSchema, req.body);
  const row = one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = ?', me.id)!;
  if (!(await verifyPassword(body.currentPassword, row.password_hash))) {
    throw new HttpError(400, 'Das aktuelle Passwort ist falsch.');
  }
  await setPassword(findUser(me.id)!, body.newPassword, res.locals.token as string);
  audit(me, 'Eigenes Passwort geändert');
  res.json({ ok: true });
});
