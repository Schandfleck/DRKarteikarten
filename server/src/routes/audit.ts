import { Router } from 'express';
import { all } from '../db.ts';
import { requireAdmin } from '../security/sessions.ts';

export const auditRouter = Router();
auditRouter.use(requireAdmin);

auditRouter.get('/', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const entries = all<{ id: number; at: string; actor_name: string; action: string; details: string }>(
    'SELECT id, at, actor_name, action, details FROM audit_log ORDER BY id DESC LIMIT ?',
    limit,
  );
  res.json({ entries: entries.map((e) => ({ id: e.id, at: e.at, actor: e.actor_name, action: e.action, details: e.details })) });
});
