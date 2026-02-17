import path from 'node:path';
import fs from 'node:fs';
import { createAppLogger } from '@vanguard-poly/utils';
import { loadEnv } from './config/env';
import {
  openDatabase,
  setEngineState,
  setEngineStateIfMissing,
  type SQLiteDatabase,
} from './database/db';
import { runMigrations } from './database/migrate';
import { startOpsServer } from './ops/server';

const logger = createAppLogger({ service: 'vanguard-poly-engine' });

const initializeSafetyState = (db: SQLiteDatabase, env: ReturnType<typeof loadEnv>): void => {
  setEngineStateIfMissing(db, 'DRY_RUN', env.DRY_RUN);
  setEngineStateIfMissing(db, 'KILL_SWITCH', env.KILL_SWITCH);
  setEngineStateIfMissing(db, 'ARMED', env.ARMED);
  setEngineStateIfMissing(db, 'last_tick', null);
};

const resolveMigrationsDir = (): string => {
  const candidates = [
    path.join(__dirname, 'database', 'migrations'),
    path.join(process.cwd(), 'apps', 'engine', 'src', 'database', 'migrations'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error('Migration directory not found');
};

const main = (): void => {
  const env = loadEnv();
  const db = openDatabase(env.DB_PATH);
  const migrationsDir = resolveMigrationsDir();
  const migrationResult = runMigrations(db, migrationsDir, logger);

  initializeSafetyState(db, env);

  const server = startOpsServer({ env, db, logger });

  const heartbeat = setInterval(() => {
    setEngineState(db, 'last_tick', new Date().toISOString());
  }, env.HEARTBEAT_INTERVAL_MS);

  heartbeat.unref();

  logger.info('Engine boot complete', {
    opsPort: env.OPS_PORT,
    dbPath: env.DB_PATH,
    migrationsApplied: migrationResult.applied,
    migrationsSkipped: migrationResult.skipped,
    DRY_RUN: env.DRY_RUN,
    KILL_SWITCH: env.KILL_SWITCH,
    ARMED: env.ARMED,
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.warn('Shutdown signal received', { signal });
    clearInterval(heartbeat);
    server.close(() => {
      db.close();
      logger.info('Engine shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

main();
