/**
 * Sicherheitstests: Außenstehende dürfen auf KEINEM Weg an Betreuer-Daten kommen.
 * Die Liste der Schnittstellen wird aus dem Quellcode gelesen – neue Schnittstellen sind automatisch mitgeprüft.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, test } from 'node:test';

process.env.DB_FILE = ':memory:';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-sec-'));

const { createApp } = await import('../src/app.ts');
const { createUser } = await import('../src/lib/users.ts');
const { run, one } = await import('../src/db.ts');
const { loginLimiter, unknownUserFailures } = await import('../src/routes/auth.ts');
const { Client } = await import('./helpers.ts');

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const ADMIN_PW = 'Admin-Passwort-123';
const BETREUER_PW = 'Betreuer-Pass-456';
const KIND_PW = 'Kinder-789';

// ---------- Alle Schnittstellen aus dem Quellcode einlesen ----------

interface Endpoint { method: string; path: string }

function discoverEndpoints(): Endpoint[] {
  const appSrc = fs.readFileSync(path.join(srcDir, 'app.ts'), 'utf8');
  const mounts = new Map<string, string>();
  for (const m of appSrc.matchAll(/app\.use\('(\/api[^']*)',\s*(\w+Router)\)/g)) mounts.set(m[2]!, m[1]!);
  const endpoints: Endpoint[] = [];
  for (const m of appSrc.matchAll(/app\.(get|post|put|patch|delete)\('(\/api[^']*)'/g)) endpoints.push({ method: m[1]!.toUpperCase(), path: m[2]! });
  for (const file of fs.readdirSync(path.join(srcDir, 'routes'))) {
    const code = fs.readFileSync(path.join(srcDir, 'routes', file), 'utf8');
    for (const m of code.matchAll(/(\w+Router)\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)) {
      const prefix = mounts.get(m[1]!);
      assert.ok(prefix, `Router ${m[1]} ist in app.ts nicht unter /api eingebunden`);
      const sub = m[3] === '/' ? '' : m[3]!;
      endpoints.push({ method: m[2]!.toUpperCase(), path: (prefix + sub).replace(/:(\w+)/g, '1') });
    }
  }
  return endpoints;
}

const endpoints = discoverEndpoints();
/** Die einzigen Schnittstellen, die ohne Anmeldung erreichbar sein dürfen. */
const PUBLIC = new Set(['GET /api/health', 'POST /api/auth/login', 'POST /api/auth/logout']);
/** Was Kinder (zusätzlich zu PUBLIC) aufrufen dürfen. */
const isChildAllowed = (e: Endpoint) => e.path.startsWith('/api/kind/') || e.path === '/api/auth/me' || (e.method === 'GET' && e.path.startsWith('/api/uploads/'));
/** Nur für Admins. */
const isAdminOnly = (e: Endpoint) => e.path.startsWith('/api/staff') || e.path.startsWith('/api/audit');
const label = (e: Endpoint) => `${e.method} ${e.path}`;

// ---------- Testumgebung ----------

let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let adminId = 0;
let betreuerId = 0;
let kindId = 0;
let otherDeckId = 0;

before(async () => {
  adminId = (await createUser({ role: 'admin', username: 'admin', displayName: 'Admin', password: ADMIN_PW, createdBy: null })).id;
  betreuerId = (await createUser({ role: 'betreuer', username: 'betreuer', displayName: 'Betreuer', password: BETREUER_PW, createdBy: null })).id;
  kindId = (await createUser({ role: 'kind', username: 'kind', displayName: 'Kind', password: KIND_PW, createdBy: null })).id;
  const ts = new Date().toISOString();
  otherDeckId = run('INSERT INTO decks (title, description, created_at, updated_at) VALUES (?, ?, ?, ?)', 'Geheimer Stapel', '', ts, ts).lastInsertRowid;
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  Client.base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

beforeEach(() => {
  loginLimiter.reset();
  unknownUserFailures.reset();
});

after(() => server.close());

async function loggedIn(username: string, password: string, app: 'betreuer' | 'kinder') {
  const c = new Client();
  assert.equal((await c.login(username, password, app)).status, 200, `Anmeldung ${username}`);
  return c;
}

const callAll = (c: InstanceType<typeof Client>, list: Endpoint[], headers: Record<string, string> = {}) =>
  Promise.all(list.map(async (e) => ({ e, r: await c.req(e.method, e.path, e.method === 'GET' ? undefined : {}, headers) })));

// ---------- Tests ----------

describe('Ohne Anmeldung', () => {
  test('Schnittstellen wurden gefunden (Plausibilität)', () => {
    assert.ok(endpoints.length >= 39, `nur ${endpoints.length} Schnittstellen gefunden`);
    for (const p of PUBLIC) assert.ok(endpoints.some((e) => label(e) === p), `${p} fehlt`);
  });

  test('JEDE nicht-öffentliche Schnittstelle antwortet mit 401', async () => {
    const results = await callAll(new Client(), endpoints.filter((e) => !PUBLIC.has(label(e))));
    const leaks = results.filter(({ r }) => r.status !== 401).map(({ e, r }) => `${label(e)} → ${r.status}`);
    assert.deepEqual(leaks, [], 'Ohne Anmeldung erreichbar');
  });

  test('Antworten enthalten keine vertraulichen Daten', async () => {
    const results = await callAll(new Client(), endpoints.filter((e) => !PUBLIC.has(label(e))));
    for (const { e, r } of results) {
      assert.doesNotMatch(r.text, /argon2|password_hash|"username"|Geheimer Stapel/i, label(e));
    }
  });

  test('gefälschte, alte und manipulierte Anmelde-Tokens werden abgelehnt', async () => {
    const tokenRow = one<{ token_hash: string }>('SELECT token_hash FROM sessions LIMIT 1');
    const fakes = [
      'kk_staff=abc', 'kk_staff=' + 'A'.repeat(43), 'kk_session=irgendwas', "kk_staff=' OR 1=1 --",
      ...(tokenRow ? [`kk_staff=${tokenRow.token_hash}`] : []), // der in der DB gespeicherte Hash ist KEIN gültiges Token
    ];
    for (const cookie of fakes) {
      const r = await new Client().req('GET', '/api/children', undefined, { cookie, 'x-kk-app': 'betreuer' });
      assert.equal(r.status, 401, cookie);
    }
    for (const auth of ['Bearer abc', 'Bearer ', 'Basic YWRtaW46YWRtaW4=']) {
      assert.equal((await new Client().req('GET', '/api/children', undefined, { authorization: auth })).status, 401, auth);
    }
  });

  test('abgelaufene Anmeldung wird abgelehnt', async () => {
    const c = await loggedIn('betreuer', BETREUER_PW, 'betreuer');
    run("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE user_id = ?", betreuerId);
    assert.equal((await c.req('GET', '/api/children', undefined, { 'x-kk-app': 'betreuer' })).status, 401);
  });

  test('SQL-Injection im Login funktioniert nicht', async () => {
    for (const username of ["admin' --", "' OR '1'='1", 'admin" OR 1=1 --']) {
      assert.equal((await new Client().login(username, "' OR '1'='1")).status, 401, username);
    }
  });
});

describe('Passwort-Raten', () => {
  test('nach 5 Fehlversuchen ist auch das RICHTIGE Passwort gesperrt', async () => {
    await createUser({ role: 'betreuer', username: 'ratetest', displayName: 'R', password: 'Richtig-Pass-1', createdBy: null });
    for (let i = 0; i < 5; i++) assert.equal((await new Client().login('ratetest', `falsch${i}`)).status, 401);
    assert.equal((await new Client().login('ratetest', 'Richtig-Pass-1')).status, 429);
  });

  test('pro IP-Adresse höchstens 30 Versuche in 15 Minuten', async () => {
    let blocked = false;
    for (let i = 0; i < 35 && !blocked; i++) blocked = (await new Client().login(`gibtsnicht${i}`, 'x')).status === 429;
    assert.ok(blocked, 'IP-Bremse greift nicht');
  });

  test('man kann nicht herausfinden, welche Benutzernamen existieren', async () => {
    await createUser({ role: 'betreuer', username: 'echt', displayName: 'E', password: 'Richtig-Pass-1', createdBy: null });
    const answers = async (username: string) => {
      const out: string[] = [];
      for (let i = 0; i < 7; i++) {
        const r = await new Client().login(username, `falsch${i}`);
        out.push(`${r.status} ${r.json.error}`);
      }
      return out;
    };
    const real = await answers('echt');
    loginLimiter.reset();
    const fake = await answers('erfunden');
    assert.deepEqual(fake, real, 'Antworten für existierendes und erfundenes Konto unterscheiden sich');
  });
});

describe('Kinder kommen nicht an Betreuer-Daten', () => {
  test('JEDE Betreuer-Schnittstelle antwortet einem Kind mit 403', async () => {
    const kid = await loggedIn('kind', KIND_PW, 'kinder');
    const staffOnly = endpoints.filter((e) => !PUBLIC.has(label(e)) && !isChildAllowed(e));
    for (const headers of [{ 'x-kk-app': 'kinder' }, { 'x-kk-app': 'betreuer' }, {}] as Record<string, string>[]) {
      const results = await callAll(kid, staffOnly, headers);
      const leaks = results.filter(({ r }) => r.status !== 403 && r.status !== 401).map(({ e, r }) => `${label(e)} → ${r.status}`);
      assert.deepEqual(leaks, [], `Kind kommt durch (Header ${JSON.stringify(headers)})`);
    }
  });

  test('Kind kann sich nicht auf der Betreuer-Website anmelden', async () => {
    const r = await new Client().login('kind', KIND_PW, 'betreuer');
    assert.equal(r.status, 403);
    assert.equal(r.headers.getSetCookie().length, 0);
  });

  test('Kind sieht keine Stapel, die ihm nicht zugeteilt sind', async () => {
    const kid = await loggedIn('kind', KIND_PW, 'kinder');
    const h = { 'x-kk-app': 'kinder' };
    assert.equal((await kid.req('GET', `/api/kind/decks/${otherDeckId}/session`, undefined, h)).status, 404);
    assert.equal((await kid.req('POST', `/api/kind/decks/${otherDeckId}/answer`, { cardId: 1, knew: true }, h)).status, 404);
    assert.doesNotMatch((await kid.req('GET', '/api/kind/decks', undefined, h)).text, /Geheimer Stapel/);
  });
});

describe('Betreuer kommen nicht an Admin-Funktionen', () => {
  test('JEDE Admin-Schnittstelle antwortet einem Betreuer mit 403', async () => {
    const b = await loggedIn('betreuer', BETREUER_PW, 'betreuer');
    const results = await callAll(b, endpoints.filter(isAdminOnly), { 'x-kk-app': 'betreuer' });
    const leaks = results.filter(({ r }) => r.status !== 403).map(({ e, r }) => `${label(e)} → ${r.status}`);
    assert.deepEqual(leaks, [], 'Betreuer kommt an Admin-Funktionen');
  });

  test('Betreuer kann über die Kinder-Verwaltung keine Admin-/Betreuer-Konten ändern', async () => {
    const b = await loggedIn('betreuer', BETREUER_PW, 'betreuer');
    const h = { 'x-kk-app': 'betreuer' };
    for (const id of [adminId, betreuerId]) {
      assert.equal((await b.req('POST', `/api/children/${id}/password`, { password: 'Uebernommen-123' }, h)).status, 404);
      assert.equal((await b.req('PATCH', `/api/children/${id}`, { active: false }, h)).status, 404);
      assert.equal((await b.req('DELETE', `/api/children/${id}`, undefined, h)).status, 404);
    }
    assert.equal((await new Client().login('admin', ADMIN_PW)).status, 200, 'Admin-Passwort wurde verändert');
  });

  test('beim Anlegen eines Kindes lässt sich keine höhere Rolle einschmuggeln', async () => {
    const b = await loggedIn('betreuer', BETREUER_PW, 'betreuer');
    const r = await b.req('POST', '/api/children', { username: 'boese', displayName: 'X', password: 'Boese-Pass-123', role: 'admin' }, { 'x-kk-app': 'betreuer' });
    assert.equal(r.status, 201);
    assert.equal(r.json.child.role, 'kind');
    assert.equal((await new Client().login('boese', 'Boese-Pass-123', 'betreuer')).status, 403);
  });

  test('deaktivierter Betreuer verliert sofort den Zugang', async () => {
    await createUser({ role: 'betreuer', username: 'weg', displayName: 'W', password: 'Weg-Pass-1234', createdBy: null });
    const gone = await loggedIn('weg', 'Weg-Pass-1234', 'betreuer');
    const admin = await loggedIn('admin', ADMIN_PW, 'betreuer');
    const id = one<{ id: number }>("SELECT id FROM users WHERE username = 'weg'")!.id;
    assert.equal((await admin.req('PATCH', `/api/staff/${id}`, { active: false }, { 'x-kk-app': 'betreuer' })).status, 200);
    assert.equal((await gone.req('GET', '/api/children', undefined, { 'x-kk-app': 'betreuer' })).status, 401);
    assert.equal((await new Client().login('weg', 'Weg-Pass-1234')).status, 403);
  });
});

describe('Dateien und Server-Interna sind nicht abrufbar', () => {
  const repoRoot = path.join(srcDir, '..', '..');
  const secrets = [
    fs.readFileSync(path.join(srcDir, 'config.ts'), 'utf8').split('\n').find((l) => l.includes('dataDir'))!.trim(),
    'SQLite format 3',
    '"workspaces"',
  ];

  test('Pfad-Tricks liefern weder Datenbank noch Quellcode noch Konfiguration', async () => {
    fs.writeFileSync(path.join(process.env.DATA_DIR!, 'karteikarten.db'), 'SQLite format 3 GEHEIM');
    const probes = [
      '/data/karteikarten.db', '/../data/karteikarten.db', '/betreuer/../../data/karteikarten.db',
      '/%2e%2e/%2e%2e/data/karteikarten.db', '/betreuer/%2e%2e%2f%2e%2e%2fpackage.json', '/..%2f..%2fpackage.json',
      '/package.json', '/.env', '/server/src/config.ts', '/betreuer/../server/src/config.ts',
      '/api/uploads/..%2f..%2fkarteikarten.db', '/api/uploads/../../karteikarten.db', '/.git/config', '/backups/',
    ];
    for (const p of probes) {
      const r = await new Client().req('GET', p);
      for (const s of [...secrets, 'GEHEIM']) assert.ok(!r.text.includes(s), `${p} gibt vertraulichen Inhalt preis`);
    }
    assert.ok(fs.existsSync(path.join(repoRoot, 'package.json')));
  });

  test('fremde Webseiten können keine Daten auslesen (kein CORS) und nichts auslösen (CSRF)', async () => {
    const admin = await loggedIn('admin', ADMIN_PW, 'betreuer');
    const evil = { origin: 'https://boese.example', 'x-kk-app': 'betreuer' };
    const read = await admin.req('GET', '/api/children', undefined, evil);
    assert.equal(read.headers.get('access-control-allow-origin'), null);
    const write = await admin.req('POST', '/api/children', { username: 'csrf', displayName: 'C', password: 'Csrf-Pass-123' }, evil);
    assert.equal(write.status, 403);
    assert.equal(one("SELECT 1 FROM users WHERE username = 'csrf'"), undefined);
    const preflight = await new Client().req('OPTIONS', '/api/children', undefined, { origin: 'https://boese.example', 'access-control-request-method': 'DELETE' });
    assert.equal(preflight.headers.get('access-control-allow-origin'), null);
  });

  test('Anmelde-Cookies sind vor Skripten und fremden Seiten geschützt', async () => {
    for (const [u, pw, app] of [['admin', ADMIN_PW, 'betreuer'], ['kind', KIND_PW, 'kinder']] as const) {
      const cookie = (await new Client().login(u, pw, app)).headers.getSetCookie()[0]!;
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /SameSite=Strict/i);
    }
  });

  test('Sicherheits-Header sind gesetzt', async () => {
    const r = await new Client().req('GET', '/betreuer/');
    assert.match(r.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
    assert.match(r.headers.get('content-security-policy') ?? '', /script-src 'self'/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-powered-by'), null);
    const api = await new Client().req('GET', '/api/auth/me');
    assert.equal(api.headers.get('cache-control'), 'no-store');
  });

  test('Fehler verraten keine Interna', async () => {
    const r = await new Client().req('POST', '/api/auth/login', Buffer.from('{kaputt'), { 'content-type': 'application/json' });
    assert.equal(r.status, 400);
    assert.doesNotMatch(r.text, /at \w+ \(|node_modules|SyntaxError|\.ts:/);
  });
});
