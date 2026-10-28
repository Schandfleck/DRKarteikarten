/**
 * Verwaltungsbefehle für die Kommandozeile auf dem Server.
 *   npm run cli -- create-admin            Ersten (oder weiteren) Admin anlegen
 *   npm run cli -- reset-password <name>   Passwort eines Kontos neu setzen (z. B. Admin vergessen)
 *   npm run cli -- backup [ordner]         Konsistente Sicherung von Datenbank + Bildern
 *   npm run cli -- demo                    Beispieldaten zum Ausprobieren (nur leere Datenbank)
 */
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { config } from './config.ts';
import { db, one } from './db.ts';
import { audit } from './lib/audit.ts';
import { HttpError, parse, zDisplayName, zUsername } from './lib/http.ts';
import { createUser, findUser, setPassword } from './lib/users.ts';

async function ask(question: string, hidden = false): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  const answer = rl.question(question);
  muted = hidden;
  const result = await answer;
  rl.close();
  if (hidden) process.stdout.write('\n');
  return hidden ? result : result.trim();
}

async function askNewPassword(): Promise<string> {
  const pw = await ask('Passwort (mind. 10 Zeichen, Eingabe unsichtbar): ', true);
  const again = await ask('Passwort wiederholen: ', true);
  if (pw !== again) throw new Error('Die Passwörter stimmen nicht überein.');
  return pw;
}

async function createAdmin(usernameArg?: string): Promise<void> {
  const username = parse(zUsername, usernameArg ?? (await ask('Benutzername für den Admin: ')));
  const displayName = parse(zDisplayName, (await ask('Anzeigename (z. B. Vor- und Nachname): ')) || username);
  const password = await askNewPassword();
  const user = await createUser({ role: 'admin', username, displayName, password, createdBy: null });
  audit(null, 'Admin angelegt (Kommandozeile)', user.username);
  console.log(`Admin "${user.username}" wurde angelegt. Anmeldung unter /betreuer/`);
}

async function resetPassword(username?: string): Promise<void> {
  if (!username) throw new Error('Bitte Benutzernamen angeben: reset-password <benutzername>');
  const row = one<{ id: number }>('SELECT id FROM users WHERE username = ?', username.toLowerCase());
  if (!row) throw new Error(`Kein Konto "${username}" gefunden.`);
  await setPassword(findUser(row.id)!, await askNewPassword());
  audit(null, 'Passwort zurückgesetzt (Kommandozeile)', username);
  console.log('Passwort wurde geändert, alle Geräte dieses Kontos wurden abgemeldet.');
}

function backup(targetArg?: string): void {
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const target = path.resolve(targetArg ?? path.join(config.dataDir, '..', 'backups'), `karteikarten-${stamp}`);
  fs.mkdirSync(target, { recursive: true });
  db.exec(`VACUUM INTO '${path.join(target, 'karteikarten.db').replaceAll("'", "''")}'`);
  if (fs.existsSync(config.uploadDir)) fs.cpSync(config.uploadDir, path.join(target, 'uploads'), { recursive: true });
  console.log(`Sicherung erstellt: ${target}`);
}

/** Legt Beispieldaten zum Ausprobieren an (nur in einer leeren Datenbank). Zugangsdaten landen in data/DEMO-ZUGANG.txt. */
async function demo(): Promise<void> {
  if (one('SELECT 1 FROM users')) throw new Error('Die Datenbank ist nicht leer – Demo-Daten werden nur in eine leere Datenbank geschrieben.');
  const { generateChildPassword } = await import('./security/passwords.ts');
  const { run, now } = await import('./db.ts');
  const adminPw = randomBytes(9).toString('base64url');
  const kidPw = generateChildPassword();
  const admin = await createUser({ role: 'admin', username: 'admin', displayName: 'Demo Admin', password: adminPw, createdBy: null });
  const kid = await createUser({ role: 'kind', username: 'max', displayName: 'Max', password: kidPw, createdBy: admin.id });
  const ts = now();
  const deckId = run('INSERT INTO decks (title, description, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    'Erste Hilfe – Grundlagen', 'Die wichtigsten Dinge, die man bei einem Notfall wissen muss.', admin.id, ts, ts).lastInsertRowid;
  const cards: [string, string, string, string, string][] = [
    ['flip', 'Welche Nummer wählst du im Notfall?', '112 – Feuerwehr und Rettungsdienst, europaweit kostenlos.', '[]', '[]'],
    ['input', 'Wie heißt die Lage, in die man bewusstlose Menschen bringt, die noch atmen?', 'Die stabile Seitenlage hält die Atemwege frei.', '["stabile Seitenlage","Seitenlage"]', '[]'],
    ['choice', 'Was gehört zu den 5 W-Fragen beim Notruf?', 'Wo, Was, Wie viele, Welche Verletzungen, Warten auf Rückfragen.', '[]',
      '[{"id":"a1","text":"Wo ist es passiert?","correct":true},{"id":"a2","text":"Wie viele Verletzte?","correct":true},{"id":"a3","text":"Wie ist das Wetter?","correct":false}]'],
  ];
  cards.forEach(([type, q, a, acc, opts], i) => run(
    `INSERT INTO cards (deck_id, position, type, question, answer, accepted_answers, options, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    deckId, i + 1, type, q, a, acc, opts, ts, ts,
  ));
  run('INSERT INTO deck_assignments (deck_id, child_id, assigned_at, assigned_by) VALUES (?, ?, ?, ?)', deckId, kid.id, ts, admin.id);
  const file = path.join(config.dataDir, 'DEMO-ZUGANG.txt');
  fs.writeFileSync(file, `Betreuer-Website (/betreuer/): admin / ${adminPw}\nKinder-App (/):               max / ${kidPw}\n`, { mode: 0o600 });
  console.log(`Demo-Daten angelegt. Zugangsdaten stehen in: ${file}`);
}

const [command, arg] = process.argv.slice(2);
try {
  switch (command) {
    case 'create-admin':
      await createAdmin(arg);
      break;
    case 'reset-password':
      await resetPassword(arg);
      break;
    case 'backup':
      backup(arg);
      break;
    case 'demo':
      await demo();
      break;
    default:
      console.log('Befehle: create-admin [benutzername] | reset-password <benutzername> | backup [zielordner] | demo');
      process.exitCode = command ? 1 : 0;
  }
} catch (err) {
  console.error(`Fehler: ${err instanceof HttpError || err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  db.close();
}
