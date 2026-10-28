import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'ja'].includes(value.toLowerCase());
}

const isProduction = process.env.NODE_ENV === 'production';
const dataDir = path.resolve(process.env.DATA_DIR ?? path.join(repoRoot, 'data'));

export const config = {
  isProduction,
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',

  /** Alles, was gespeichert wird, liegt in diesem einen Ordner (Datenbank + Bilder). */
  dataDir,
  dbFile: path.join(dataDir, 'karteikarten.db'),
  uploadDir: path.join(dataDir, 'uploads'),

  /** Gebaute Web-Oberflächen, die der Server mit ausliefert. */
  betreuerDist: path.join(repoRoot, 'apps', 'betreuer', 'dist'),
  kinderDist: path.join(repoRoot, 'apps', 'kinder', 'dist'),

  /** In Produktion läuft die Seite nur über HTTPS – das Cookie darf dann nur verschlüsselt übertragen werden. */
  cookieSecure: bool(process.env.COOKIE_SECURE, isProduction),
  /** Anzahl vorgeschalteter Proxys (z. B. 1 bei Caddy/nginx), damit die echte Besucher-IP erkannt wird. */
  trustProxy: Number(process.env.TRUST_PROXY ?? (isProduction ? 1 : 0)),
  /** Öffentliche Adresse, z. B. https://karteikarten.firma.de – Anfragen von fremden Seiten werden abgelehnt. */
  publicOrigin: process.env.PUBLIC_ORIGIN?.replace(/\/$/, '') ?? '',

  sessionHoursStaff: Number(process.env.SESSION_HOURS_STAFF ?? 12),
  sessionDaysChild: Number(process.env.SESSION_DAYS_CHILD ?? 30),

  maxUploadBytes: 5 * 1024 * 1024,
};
