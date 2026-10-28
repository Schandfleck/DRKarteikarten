import fs from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { config } from './config.ts';

/**
 * Datenbank-Schema. Jede Migration läuft genau einmal (gezählt über PRAGMA user_version).
 * Neue Änderungen immer als NEUEN Eintrag anhängen – bestehende nie nachträglich ändern.
 */
const migrations: string[] = [
  `
  CREATE TABLE users (
    id                  INTEGER PRIMARY KEY,
    role                TEXT NOT NULL CHECK (role IN ('admin', 'betreuer', 'kind')),
    username            TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name        TEXT NOT NULL,
    password_hash       TEXT NOT NULL,
    active              INTEGER NOT NULL DEFAULT 1,
    failed_logins       INTEGER NOT NULL DEFAULT 0,
    locked_until        TEXT,
    last_login_at       TEXT,
    password_changed_at TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    created_by          INTEGER REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE sessions (
    token_hash   TEXT PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at   TEXT NOT NULL,
    user_agent   TEXT
  );
  CREATE INDEX sessions_user ON sessions(user_id);

  CREATE TABLE images (
    id         TEXT PRIMARY KEY,
    mime       TEXT NOT NULL,
    size       INTEGER NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE decks (
    id          INTEGER PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE cards (
    id               INTEGER PRIMARY KEY,
    deck_id          INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    position         INTEGER NOT NULL,
    type             TEXT NOT NULL CHECK (type IN ('flip', 'input', 'choice')),
    question         TEXT NOT NULL DEFAULT '',
    question_image   TEXT REFERENCES images(id) ON DELETE SET NULL,
    answer           TEXT NOT NULL DEFAULT '',
    answer_image     TEXT REFERENCES images(id) ON DELETE SET NULL,
    accepted_answers TEXT NOT NULL DEFAULT '[]',
    case_sensitive   INTEGER NOT NULL DEFAULT 0,
    options          TEXT NOT NULL DEFAULT '[]',
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  );
  CREATE INDEX cards_deck ON cards(deck_id, position);

  CREATE TABLE deck_assignments (
    deck_id     INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    child_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TEXT NOT NULL,
    assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (deck_id, child_id)
  );
  CREATE INDEX deck_assignments_child ON deck_assignments(child_id);

  -- Ein Lerndurchgang eines Kindes durch einen Stapel ("Runden, bis alles richtig ist")
  CREATE TABLE study_runs (
    id          INTEGER PRIMARY KEY,
    child_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    deck_id     INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    round       INTEGER NOT NULL DEFAULT 1,
    started_at  TEXT NOT NULL,
    last_activity_at TEXT NOT NULL,
    finished_at TEXT
  );
  CREATE UNIQUE INDEX study_runs_active ON study_runs(child_id, deck_id) WHERE finished_at IS NULL;
  CREATE INDEX study_runs_child_deck ON study_runs(child_id, deck_id, started_at);

  CREATE TABLE run_cards (
    run_id     INTEGER NOT NULL REFERENCES study_runs(id) ON DELETE CASCADE,
    card_id    INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    solved     INTEGER NOT NULL DEFAULT 0,
    attempts   INTEGER NOT NULL DEFAULT 0,
    wrong      INTEGER NOT NULL DEFAULT 0,
    last_round INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (run_id, card_id)
  );

  CREATE TABLE audit_log (
    id         INTEGER PRIMARY KEY,
    at         TEXT NOT NULL,
    actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_name TEXT NOT NULL,
    action     TEXT NOT NULL,
    details    TEXT NOT NULL DEFAULT ''
  );
  `,
  `
  -- Sprache der Oberfläche pro Konto; NULL = noch nicht gewählt (dann gilt die Auswahl des Geräts)
  ALTER TABLE users ADD COLUMN language TEXT CHECK (language IN ('de', 'ar'));
  `,
];

export function openDatabase(file: string): DatabaseSync {
  if (file !== ':memory:') fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let i = version; i < migrations.length; i++) {
    db.exec('BEGIN');
    try {
      db.exec(migrations[i]!);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return db;
}

/** DB_FILE=:memory: wird von den automatischen Tests genutzt. */
export const db: DatabaseSync = openDatabase(process.env.DB_FILE ?? config.dbFile);

type Param = SQLInputValue;

export function one<T>(sql: string, ...params: Param[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function all<T>(sql: string, ...params: Param[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function run(sql: string, ...params: Param[]): { changes: number; lastInsertRowid: number } {
  const result = db.prepare(sql).run(...params);
  return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
}

/** Führt mehrere Schritte als Einheit aus: entweder klappt alles, oder nichts wird gespeichert. */
export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function now(): string {
  return new Date().toISOString();
}
