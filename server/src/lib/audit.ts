import { now, run } from '../db.ts';
import type { SessionUser } from '../security/sessions.ts';

/** Protokolliert wichtige Änderungen (wer hat wann was gemacht). Passwörter landen hier niemals. */
export function audit(actor: SessionUser | null, action: string, details = ''): void {
  run(
    'INSERT INTO audit_log (at, actor_id, actor_name, action, details) VALUES (?, ?, ?, ?, ?)',
    now(), actor?.id ?? null, actor ? `${actor.displayName} (${actor.username})` : 'System', action, details,
  );
}
