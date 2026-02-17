import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createAppLogger } from '@vanguard-poly/utils';
import { loadEnv } from '../config/env';
import { openDatabase } from '../database/db';
import { runMigrations } from '../database/migrate';
import { buildOpsApp } from '../ops/server';

const tempPaths: string[] = [];

afterEach(() => {
  for (const tempPath of tempPaths) {
    fs.rmSync(tempPath, { recursive: true, force: true });
  }

  tempPaths.length = 0;
});

describe('ops endpoint auth', () => {
  it('rejects missing or invalid token', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vanguard-poly-ops-'));
    tempPaths.push(tempDir);

    const db = openDatabase(path.join(tempDir, 'engine.db'));
    runMigrations(db, path.join(__dirname, '../database/migrations'));

    const env = loadEnv({
      VANGUARD_TOKEN: 'correct-token',
      DB_PATH: path.join(tempDir, 'engine.db'),
    });

    const app = buildOpsApp({
      env,
      db,
      logger: createAppLogger({ service: 'ops-auth-test', logDir: path.join(tempDir, 'logs') }),
    });

    await request(app).get('/ops/status').expect(401);
    await request(app).get('/ops/status').set('x-vanguard-token', 'wrong-token').expect(401);

    const success = await request(app)
      .get('/ops/status')
      .set('x-vanguard-token', 'correct-token')
      .expect(200);

    expect(success.body.ok).toBe(true);

    db.close();
  });
});
