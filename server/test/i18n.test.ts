import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';

process.env.DB_FILE = ':memory:';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-i18n-'));

const { createApp } = await import('../src/app.ts');
const { createUser } = await import('../src/lib/users.ts');
const { translateArabic } = await import('../src/lib/i18n.ts');
const { Client } = await import('./helpers.ts');

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** Alle Meldungen im Server-Code, die bei Benutzern ankommen können (deutscher Satz mit Punkt am Ende). */
function serverMessages(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.isDirectory()) walk(path.join(dir, f.name));
      else if (f.name.endsWith('.ts') && f.name !== 'i18n.ts' && f.name !== 'cli.ts') files.push(path.join(dir, f.name));
    }
  };
  walk(srcDir);
  const found = new Set<string>();
  for (const file of files) {
    const code = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const m of code.matchAll(/'([A-ZÄÖÜ][^'\n]*[.!?])'/g)) if (m[1]!.includes(' ')) found.add(m[1]!);
    // Vorlagen mit ${…}: Platzhalter durch Beispielwerte ersetzen
    for (const m of code.matchAll(/`([A-ZÄÖÜ$][^`\n]*[.!?])`/g)) {
      if (m[1]!.includes(' ')) found.add(m[1]!.replace(/\$\{what\}/g, 'Kind').replace(/\$\{[^}]+\}/g, '15'));
    }
  }
  // Keine Benutzer-Meldungen: SQL-Befehle und der Hinweis für Administratoren beim Serverstart
  const notForUsers = /^(SELECT|INSERT|UPDATE|DELETE|PRAGMA|CREATE|ALTER)\b|npm run/;
  return [...found].filter((m) => !notForUsers.test(m)).sort();
}

let server: ReturnType<ReturnType<typeof createApp>['listen']>;
before(async () => {
  await createUser({ role: 'kind', username: 'kind', displayName: 'Kind', password: 'Kinder-789', createdBy: null });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  Client.base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(() => server.close());

describe('Arabische Übersetzung', () => {
  test('JEDE Meldung im Server-Code hat eine arabische Übersetzung', () => {
    const messages = serverMessages();
    assert.ok(messages.length > 40, `nur ${messages.length} Meldungen gefunden`);
    const missing = messages.filter((m) => !translateArabic(m));
    assert.deepEqual(missing, [], 'Ohne Übersetzung (bitte in server/src/lib/i18n.ts ergänzen)');
  });

  test('Server antwortet auf Arabisch, wenn die Oberfläche das verlangt', async () => {
    const ar = await new Client().req('POST', '/api/auth/login', { username: 'kind', password: 'falsch' }, { 'x-kk-lang': 'ar' });
    assert.equal(ar.json.error, 'اسم المستخدم أو كلمة المرور غير صحيحة.');
    const de = await new Client().req('POST', '/api/auth/login', { username: 'kind', password: 'falsch' });
    assert.equal(de.json.error, 'Benutzername oder Passwort ist falsch.');
    const unauth = await new Client().req('GET', '/api/children', undefined, { 'x-kk-lang': 'ar' });
    assert.equal(unauth.json.error, 'يرجى تسجيل الدخول.');
  });

  test('Sprache wird pro Konto gespeichert', async () => {
    const kid = new Client();
    const login = await kid.login('kind', 'Kinder-789', 'kinder');
    assert.equal(login.json.user.language, null, 'neues Konto: noch keine Sprache gewählt');
    const h = { 'x-kk-app': 'kinder' };
    assert.equal((await kid.req('PUT', '/api/auth/language', { language: 'ar' }, h)).json.user.language, 'ar');
    assert.equal((await new Client().login('kind', 'Kinder-789', 'kinder')).json.user.language, 'ar', 'gilt auch auf neuem Gerät');
    assert.equal((await kid.req('PUT', '/api/auth/language', { language: 'fr' }, h)).status, 400);
    assert.equal((await new Client().req('PUT', '/api/auth/language', { language: 'ar' })).status, 401);
  });
});
