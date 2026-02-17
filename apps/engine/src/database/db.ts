import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export type SQLiteDatabase = Database.Database;

export const openDatabase = (dbPath: string): SQLiteDatabase => {
  const resolvedPath = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const db = new Database(resolvedPath);
  applyPragmas(db);
  return db;
};

export const applyPragmas = (db: SQLiteDatabase): void => {
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 2000');
  db.pragma('synchronous = NORMAL');
};

export type DatabasePragmas = {
  journalMode: string;
  busyTimeout: number;
  synchronous: number;
};

export const readPragmas = (db: SQLiteDatabase): DatabasePragmas => ({
  journalMode: String(db.pragma('journal_mode', { simple: true })).toLowerCase(),
  busyTimeout: Number(db.pragma('busy_timeout', { simple: true })),
  synchronous: Number(db.pragma('synchronous', { simple: true })),
});

const serializeStateValue = (value: unknown): string => JSON.stringify(value);

export const setEngineState = (db: SQLiteDatabase, key: string, value: unknown): void => {
  const statement = db.prepare(
    `
      INSERT INTO engine_state (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `,
  );

  statement.run(key, serializeStateValue(value));
};

export const setEngineStateIfMissing = (db: SQLiteDatabase, key: string, value: unknown): void => {
  const statement = db.prepare(
    `
      INSERT INTO engine_state (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO NOTHING
    `,
  );

  statement.run(key, serializeStateValue(value));
};

export const getEngineStateRaw = (db: SQLiteDatabase, key: string): string | null => {
  const statement = db.prepare<{ key: string }, { value: string }>(
    'SELECT value FROM engine_state WHERE key = @key',
  );
  const row = statement.get({ key });
  return row ? row.value : null;
};

export const getEngineState = <T>(db: SQLiteDatabase, key: string, fallback: T): T => {
  const raw = getEngineStateRaw(db, key);

  if (raw === null) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};
