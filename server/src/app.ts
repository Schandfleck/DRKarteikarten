import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.ts';
import { errorHandler, HttpError } from './lib/http.ts';
import { auditRouter } from './routes/audit.ts';
import { authRouter } from './routes/auth.ts';
import { childRouter } from './routes/child.ts';
import { childrenRouter } from './routes/children.ts';
import { cardsRouter, decksRouter } from './routes/decks.ts';
import { staffRouter } from './routes/staff.ts';
import { uploadsRouter } from './routes/uploads.ts';
import { sessionMiddleware } from './security/sessions.ts';

/**
 * Schutz gegen Anfragen, die von fremden Webseiten aus abgeschickt werden (CSRF).
 * Zusätzlich zum SameSite-Cookie: ändernde Anfragen müssen von der eigenen Adresse kommen.
 */
function sameOriginOnly(req: Request, _res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next(); // z. B. native App oder Kommandozeile – dort gibt es kein Cookie-Risiko
  const allowed = config.publicOrigin || `${req.protocol}://${req.get('host')}`;
  if (origin !== allowed) return next(new HttpError(403, 'Anfrage von fremder Seite abgelehnt.'));
  next();
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(config.cookieSecure ? ['upgrade-insecure-requests'] : []),
].join('; ');

/** Sicherheits-Header gegen eingeschleuste Skripte, Einbetten in fremde Seiten und unverschlüsselte Aufrufe. */
function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (config.cookieSecure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

/** Liefert eine gebaute Web-Oberfläche aus (Single-Page-App: unbekannte Pfade → index.html). */
function spa(dist: string, name: string) {
  const router = express.Router();
  router.use(express.static(dist, {
    index: false,
    setHeaders(res, file) {
      if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  router.get('/{*rest}', (_req, res) => {
    const index = path.join(dist, 'index.html');
    if (!fs.existsSync(index)) {
      res.status(503).type('text').send(`Die ${name} wurde noch nicht gebaut. Bitte "npm run build" ausführen.`);
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
  return router;
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(securityHeaders);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', sameOriginOnly);
  app.use('/api', sessionMiddleware);
  app.use('/api/uploads', uploadsRouter); // vor express.json(), da Bilder als Rohdaten kommen
  app.use('/api', express.json({ limit: '200kb' }));

  app.use('/api/auth', authRouter);
  app.use('/api/staff', staffRouter);
  app.use('/api/children', childrenRouter);
  app.use('/api/decks', decksRouter);
  app.use('/api/cards', cardsRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/kind', childRouter);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Unbekannte Schnittstelle.')));

  app.use('/betreuer', spa(config.betreuerDist, 'Betreuer-Website'));
  app.use('/', spa(config.kinderDist, 'Kinder-App'));

  app.use(errorHandler);
  return app;
}
