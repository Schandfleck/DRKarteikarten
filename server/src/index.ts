import { createApp } from './app.ts';
import { config } from './config.ts';
import { db, one } from './db.ts';
import { purgeOrphanImages } from './lib/images.ts';
import { purgeExpiredSessions } from './security/sessions.ts';

function housekeeping(): void {
  purgeExpiredSessions();
  purgeOrphanImages();
}
housekeeping();
setInterval(housekeeping, 6 * 3600_000).unref();

const server = createApp().listen(config.port, config.host, () => {
  console.log(`Karteikarten-Server läuft auf http://localhost:${config.port}`);
  console.log(`  Kinder-App:       http://localhost:${config.port}/`);
  console.log(`  Betreuer-Website: http://localhost:${config.port}/betreuer/`);
  console.log(`  Daten-Ordner:     ${config.dataDir}`);
  if (!one("SELECT 1 FROM users WHERE role = 'admin'")) {
    console.log('\n  Noch kein Admin vorhanden. Ersten Admin anlegen mit:  npm run cli -- create-admin');
  }
});

function shutdown(): void {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
