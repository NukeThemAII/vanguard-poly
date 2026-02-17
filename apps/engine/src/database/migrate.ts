import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from 'winston';
import type { SQLiteDatabase } from './db';

export type MigrationResult = {
  applied: string[];
  skipped: string[];
};

const ensureMigrationsTable = (db: SQLiteDatabase): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

const listMigrationFiles = (migrationsDir: string): string[] => {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  return fs
    .readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
};

export const runMigrations = (
  db: SQLiteDatabase,
  migrationsDir: string,
  logger?: Logger,
): MigrationResult => {
  ensureMigrationsTable(db);

  const applied: string[] = [];
  const skipped: string[] = [];
  const files = listMigrationFiles(migrationsDir);

  const hasMigration = db.prepare<{ version: string }, { version: string }>(
    'SELECT version FROM schema_migrations WHERE version = @version',
  );

  const recordMigration = db.prepare('INSERT INTO schema_migrations (version) VALUES (?)');

  for (const fileName of files) {
    const alreadyApplied = hasMigration.get({ version: fileName });

    if (alreadyApplied) {
      skipped.push(fileName);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, fileName), 'utf8');
    db.exec(sql);
    recordMigration.run(fileName);
    applied.push(fileName);
    logger?.info('Applied migration', { migration: fileName });
  }

  return { applied, skipped };
};
