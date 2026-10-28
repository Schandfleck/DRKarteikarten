import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import express, { Router } from 'express';
import { config } from '../config.ts';
import { now, one, run } from '../db.ts';
import { HttpError, notFound } from '../lib/http.ts';
import { detectImageType, imagePath } from '../lib/images.ts';
import { currentUser, requireAnyUser, requireStaff } from '../security/sessions.ts';

/**
 * Bilder für Karten. Hochladen dürfen nur Betreuer, ansehen alle angemeldeten Benutzer.
 * Dateien bekommen einen zufälligen Namen; Originalnamen werden nicht gespeichert.
 */
export const uploadsRouter = Router();

uploadsRouter.post(
  '/',
  requireStaff,
  express.raw({ type: 'image/*', limit: config.maxUploadBytes }),
  (req, res) => {
    const me = currentUser(res);
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'Keine Bilddatei erhalten.');
    const type = detectImageType(req.body);
    if (!type) throw new HttpError(415, 'Nur Bilder im Format PNG, JPG, WEBP oder GIF sind erlaubt.');
    const id = randomBytes(16).toString('hex');
    fs.mkdirSync(config.uploadDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(imagePath(id, type.mime), req.body, { mode: 0o600 });
    run('INSERT INTO images (id, mime, size, created_by, created_at) VALUES (?, ?, ?, ?, ?)', id, type.mime, req.body.length, me.id, now());
    res.status(201).json({ id });
  },
);

uploadsRouter.get('/:id', requireAnyUser, (req, res) => {
  const id = String(req.params.id);
  if (!/^[a-f0-9]{32}$/.test(id)) throw notFound('Bild');
  const img = one<{ mime: string }>('SELECT mime FROM images WHERE id = ?', id);
  if (!img) throw notFound('Bild');
  res.setHeader('Content-Type', img.mime);
  res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(imagePath(id, img.mime));
});
