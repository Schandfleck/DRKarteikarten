import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.ts';
import { all, one, run } from '../db.ts';
import { HttpError } from './http.ts';

/** Erkennt das Bildformat am Dateiinhalt (nicht am Dateinamen) – andere Dateien werden abgelehnt. */
export function detectImageType(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return { mime: 'image/png', ext: 'png' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (buf.toString('ascii', 0, 4) === 'GIF8') return { mime: 'image/gif', ext: 'gif' };
  return null;
}

export function imagePath(id: string, mime: string): string {
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[mime] ?? 'bin';
  return path.join(config.uploadDir, `${id}.${ext}`);
}

export function assertImagesExist(...ids: (string | null)[]): void {
  for (const id of ids) {
    if (id && !one('SELECT 1 FROM images WHERE id = ?', id)) throw new HttpError(400, 'Ein Bild wurde nicht gefunden. Bitte erneut hochladen.');
  }
}

function isReferenced(id: string): boolean {
  return !!one('SELECT 1 FROM cards WHERE question_image = ? OR answer_image = ? LIMIT 1', id, id);
}

function removeImage(id: string, mime: string): void {
  run('DELETE FROM images WHERE id = ?', id);
  fs.rmSync(imagePath(id, mime), { force: true });
}

/** Löscht Bilder, die von keiner Karte mehr verwendet werden. */
export function deleteIfUnused(...ids: (string | null)[]): void {
  for (const id of ids) {
    if (!id || isReferenced(id)) continue;
    const img = one<{ mime: string }>('SELECT mime FROM images WHERE id = ?', id);
    if (img) removeImage(id, img.mime);
  }
}

/** Räumt hochgeladene, aber nie verwendete Bilder auf (z. B. Karte angefangen und abgebrochen). */
export function purgeOrphanImages(olderThanHours = 24): number {
  const cutoff = new Date(Date.now() - olderThanHours * 3600_000).toISOString();
  const orphans = all<{ id: string; mime: string }>(
    `SELECT id, mime FROM images i WHERE created_at < ?
       AND NOT EXISTS (SELECT 1 FROM cards c WHERE c.question_image = i.id OR c.answer_image = i.id)`,
    cutoff,
  );
  for (const img of orphans) removeImage(img.id, img.mime);
  return orphans.length;
}
