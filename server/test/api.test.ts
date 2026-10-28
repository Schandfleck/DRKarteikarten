import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

// Eigene, leere Test-Datenbank im Arbeitsspeicher + temporärer Bilder-Ordner
process.env.DB_FILE = ':memory:';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-test-'));

const { createApp } = await import('../src/app.ts');
const { createUser } = await import('../src/lib/users.ts');
const { one } = await import('../src/db.ts');
const { loginLimiter } = await import('../src/routes/auth.ts');

let base = '';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;

class Client {
  cookie = '';
  async req(method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body !== undefined && !(body instanceof Buffer) ? { 'content-type': 'application/json' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: body instanceof Buffer ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0]!;
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json, headers: res.headers };
  }
  login(username: string, password: string) {
    return this.req('POST', '/api/auth/login', { username, password });
  }
}

before(async () => {
  await createUser({ role: 'admin', username: 'admin', displayName: 'Admin', password: 'Admin-Passwort-123', createdBy: null });
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const addr = server.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
});

after(() => {
  server.close();
});

describe('Passwörter', () => {
  test('werden nur als Argon2id-Hash gespeichert, nie im Klartext', async () => {
    const row = one<{ password_hash: string }>("SELECT password_hash FROM users WHERE username = 'admin'")!;
    assert.match(row.password_hash, /^\$argon2id\$v=19\$m=65536,t=3,p=4\$/);
    assert.ok(!row.password_hash.includes('Admin-Passwort-123'));
  });

  test('gleiche Passwörter ergeben unterschiedliche Hashes (Salt)', async () => {
    const { hashPassword } = await import('../src/security/passwords.ts');
    assert.notEqual(await hashPassword('gleich123456'), await hashPassword('gleich123456'));
  });
});

describe('Anmeldung', () => {
  test('falsches Passwort wird abgelehnt', async () => {
    const r = await new Client().login('admin', 'falsch');
    assert.equal(r.status, 401);
  });

  test('Cookie ist httpOnly und SameSite=Strict', async () => {
    const r = await new Client().login('admin', 'Admin-Passwort-123');
    assert.equal(r.status, 200);
    const cookie = r.headers.get('set-cookie')!;
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
  });

  test('Konto wird nach 5 Fehlversuchen gesperrt', async () => {
    await createUser({ role: 'kind', username: 'sperrtest', displayName: 'S', password: 'richtig123', createdBy: null });
    const c = new Client();
    for (let i = 0; i < 5; i++) assert.equal((await c.login('sperrtest', 'falsch')).status, 401);
    const r = await c.login('sperrtest', 'richtig123');
    assert.equal(r.status, 429);
    loginLimiter.reset();
  });

  test('Anfragen von fremden Webseiten werden abgelehnt', async () => {
    const c = new Client();
    await c.login('admin', 'Admin-Passwort-123');
    const r = await c.req('POST', '/api/decks', { title: 'x' }, { origin: 'https://boese-seite.example' });
    assert.equal(r.status, 403);
  });

  test('native App bekommt Token statt Cookie', async () => {
    const r = await new Client().req('POST', '/api/auth/login', { username: 'admin', password: 'Admin-Passwort-123', client: 'native' });
    assert.equal(r.status, 200);
    assert.ok(r.json.token);
    const me = await fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${r.json.token}` } });
    assert.equal(me.status, 200);
  });
});

describe('Kompletter Ablauf: Betreuer legt an, Kind lernt', () => {
  const admin = new Client();
  const kid = new Client();
  let deckId = 0;
  let childId = 0;

  test('Betreuer legt Stapel mit drei Kartentypen an', async () => {
    await admin.login('admin', 'Admin-Passwort-123');
    const deck = await admin.req('POST', '/api/decks', { title: 'Erste Hilfe', description: 'Grundlagen' });
    assert.equal(deck.status, 201);
    deckId = deck.json.deck.id;

    const flip = await admin.req('POST', `/api/decks/${deckId}/cards`, { type: 'flip', question: 'Notruf?', answer: '112' });
    assert.equal(flip.status, 201, JSON.stringify(flip.json));
    const input = await admin.req('POST', `/api/decks/${deckId}/cards`, { type: 'input', question: 'Stabile ...?', acceptedAnswers: ['Seitenlage'], answer: 'Bei Bewusstlosigkeit' });
    assert.equal(input.status, 201, JSON.stringify(input.json));
    const choice = await admin.req('POST', `/api/decks/${deckId}/cards`, {
      type: 'choice', question: 'Was gehört in den Verbandkasten?',
      options: [{ text: 'Pflaster', correct: true }, { text: 'Schere', correct: true }, { text: 'Hammer', correct: false }],
    });
    assert.equal(choice.status, 201, JSON.stringify(choice.json));
  });

  test('ungültige Karten werden abgelehnt', async () => {
    const r = await admin.req('POST', `/api/decks/${deckId}/cards`, { type: 'choice', question: 'x', options: [{ text: 'a', correct: false }, { text: 'b', correct: false }] });
    assert.equal(r.status, 400);
  });

  test('Betreuer legt Kind an und teilt den Stapel zu', async () => {
    const r = await admin.req('POST', '/api/children', { username: 'Max.M', displayName: 'Max', password: 'Tiger-Blau-12', deckIds: [deckId] });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.child.username, 'max.m');
    childId = r.json.child.id;
  });

  test('Kind darf keine Betreuer-Funktionen nutzen', async () => {
    assert.equal((await kid.login('max.m', 'Tiger-Blau-12')).status, 200);
    assert.equal((await kid.req('GET', '/api/children')).status, 403);
    assert.equal((await kid.req('POST', '/api/decks', { title: 'x' })).status, 403);
  });

  test('Lösungen von Eingabe-/Auswahlkarten werden vorher nicht verraten', async () => {
    const s = await kid.req('GET', `/api/kind/decks/${deckId}/session`);
    assert.equal(s.json.status, 'active');
    const raw = JSON.stringify(s.json);
    assert.ok(!raw.includes('Seitenlage'));
    assert.ok(!raw.includes('"correct"'));
    const choice = s.json.cards.find((c: any) => c.type === 'choice');
    assert.equal(choice.multiple, true);
  });

  test('Runden laufen, bis alle Karten richtig sind', async () => {
    // Runde 1: Eingabe richtig (andere Schreibweise), Rest falsch
    let s = await kid.req('GET', `/api/kind/decks/${deckId}/session`);
    assert.equal(s.json.round, 1);
    assert.equal(s.json.cards.length, 3);
    for (const card of s.json.cards) {
      const body = card.type === 'input' ? { cardId: card.id, text: '  seitenlage. ' } : card.type === 'flip' ? { cardId: card.id, knew: false } : { cardId: card.id, optionIds: [card.options[0].id] };
      const a = await kid.req('POST', `/api/kind/decks/${deckId}/answer`, body);
      assert.equal(a.json.correct, card.type === 'input', card.type);
    }

    // Runde 2: nur noch die zwei falschen Karten
    s = await kid.req('GET', `/api/kind/decks/${deckId}/session`);
    assert.equal(s.json.round, 2);
    assert.equal(s.json.cards.length, 2);
    assert.equal(s.json.solved, 1);
    const rawCards = await admin.req('GET', `/api/decks/${deckId}`);
    for (const card of s.json.cards) {
      const full = rawCards.json.cards.find((c: any) => c.id === card.id);
      const body = card.type === 'flip' ? { cardId: card.id, knew: true } : { cardId: card.id, optionIds: full.options.filter((o: any) => o.correct).map((o: any) => o.id) };
      assert.equal((await kid.req('POST', `/api/kind/decks/${deckId}/answer`, body)).json.correct, true);
    }

    s = await kid.req('GET', `/api/kind/decks/${deckId}/session`);
    assert.equal(s.json.status, 'finished');
    assert.equal(s.json.summary.rounds, 2);
    assert.equal(s.json.summary.wrong, 2);
  });

  test('Betreuer sieht den Fortschritt', async () => {
    const r = await admin.req('GET', `/api/children/${childId}/decks/${deckId}`);
    assert.equal(r.json.progress.status, 'abgeschlossen');
    assert.equal(r.json.progress.completions, 1);
    assert.equal(r.json.cards.filter((c: any) => c.wrong === 1).length, 2);
  });

  test('Passwort-Reset meldet das Kind auf allen Geräten ab', async () => {
    assert.equal((await admin.req('POST', `/api/children/${childId}/password`, { password: 'Neues-Pass-99' })).status, 200);
    assert.equal((await kid.req('GET', '/api/kind/decks')).status, 401);
  });

  test('Bild-Upload akzeptiert nur echte Bilder', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5e10000000049454e44ae426082', 'hex');
    const ok = await admin.req('POST', '/api/uploads', png, { 'content-type': 'image/png' });
    assert.equal(ok.status, 201);
    const fake = await admin.req('POST', '/api/uploads', Buffer.from('<script>alert(1)</script>....'), { 'content-type': 'image/png' });
    assert.equal(fake.status, 415);
    const img = await admin.req('GET', `/api/uploads/${ok.json.id}`);
    assert.equal(img.status, 200);
    assert.equal((await new Client().req('GET', `/api/uploads/${ok.json.id}`)).status, 401);
  });

  test('Löschen eines Kindes entfernt auch dessen Lernstand', async () => {
    assert.equal((await admin.req('DELETE', `/api/children/${childId}`)).status, 200);
    assert.equal(one<{ n: number }>('SELECT COUNT(*) AS n FROM study_runs WHERE child_id = ?', childId)!.n, 0);
  });
});
