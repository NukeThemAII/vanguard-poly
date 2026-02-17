import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, readPragmas } from '../database/db';

const tempPaths: string[] = [];

afterEach(() => {
  for (const tempPath of tempPaths) {
    fs.rmSync(tempPath, { recursive: true, force: true });
  }

  tempPaths.length = 0;
});

describe('database pragmas', () => {
  it('applies WAL and tuned sqlite pragmas', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vanguard-poly-db-'));
    tempPaths.push(tempDir);

    const dbPath = path.join(tempDir, 'engine.db');
    const db = openDatabase(dbPath);

    const pragmas = readPragmas(db);

    expect(pragmas.journalMode).toBe('wal');
    expect(pragmas.busyTimeout).toBe(2000);
    expect(pragmas.synchronous).toBe(1);

    db.close();
  });
});
