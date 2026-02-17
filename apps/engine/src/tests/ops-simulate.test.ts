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

describe('ops simulate-trade endpoint', () => {
  it('executes simulator when authorized', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vanguard-poly-ops-sim-'));
    tempPaths.push(tempDir);

    const db = openDatabase(path.join(tempDir, 'engine.db'));
    runMigrations(db, path.join(__dirname, '../database/migrations'));

    const env = loadEnv({
      VANGUARD_TOKEN: 'correct-token',
      DB_PATH: path.join(tempDir, 'engine.db'),
    });

    let called = false;

    const app = buildOpsApp({
      env,
      db,
      logger: createAppLogger({ service: 'ops-sim-test', logDir: path.join(tempDir, 'logs') }),
      phase3Simulator: {
        simulateTrade: async () => {
          called = true;
          return {
            selectedMarketId: 'm-1',
            selectedTokenId: 'token-1',
            execution: {
              intentId: 'intent-1',
              placement: null,
              risk: {
                allowed: true,
                violations: [],
                projectedExposureUsd: 100,
              },
              status: 'FILLED',
              reason: null,
            },
          };
        },
      },
    });

    const response = await request(app)
      .post('/ops/simulate-trade')
      .set('x-vanguard-token', 'correct-token')
      .send({ side: 'BUY', sizeUsd: 42 })
      .expect(200);

    expect(called).toBe(true);
    expect(response.body.ok).toBe(true);
    expect(response.body.selectedMarketId).toBe('m-1');

    db.close();
  });

  it('rejects invalid simulate payload', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vanguard-poly-ops-sim-invalid-'));
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
      logger: createAppLogger({
        service: 'ops-sim-invalid-test',
        logDir: path.join(tempDir, 'logs'),
      }),
    });

    await request(app)
      .post('/ops/simulate-trade')
      .set('x-vanguard-token', 'correct-token')
      .send({ confidence: 2 })
      .expect(400);

    db.close();
  });
});
