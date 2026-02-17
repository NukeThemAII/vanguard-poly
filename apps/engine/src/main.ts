import path from 'node:path';
import fs from 'node:fs';
import { PolymarketMarketProvider } from '@vanguard-poly/adapters';
import { createAppLogger } from '@vanguard-poly/utils';
import { loadEnv } from './config/env';
import {
  openDatabase,
  setEngineState,
  setEngineStateIfMissing,
  type SQLiteDatabase,
} from './database/db';
import { runMigrations } from './database/migrate';
import { DryRunExecutionClient } from './execution/dry-run-execution-client';
import { TradeExecutionOrchestrator } from './execution/orchestrator';
import { startOpsServer } from './ops/server';
import { Phase3Simulator } from './phase3/simulator';

const logger = createAppLogger({ service: 'vanguard-poly-engine' });

const initializeSafetyState = (db: SQLiteDatabase, env: ReturnType<typeof loadEnv>): void => {
  setEngineStateIfMissing(db, 'DRY_RUN', env.DRY_RUN);
  setEngineStateIfMissing(db, 'KILL_SWITCH', env.KILL_SWITCH);
  setEngineStateIfMissing(db, 'ARMED', env.ARMED);
  setEngineStateIfMissing(db, 'MAX_USD_PER_TRADE', env.MAX_USD_PER_TRADE);
  setEngineStateIfMissing(db, 'MAX_OPEN_POSITIONS', env.MAX_OPEN_POSITIONS);
  setEngineStateIfMissing(db, 'MAX_DAILY_LOSS_USD', env.MAX_DAILY_LOSS_USD);
  setEngineStateIfMissing(db, 'MAX_TOTAL_EXPOSURE_USD', env.MAX_TOTAL_EXPOSURE_USD);
  setEngineStateIfMissing(db, 'MIN_LIQUIDITY_USD', env.MIN_LIQUIDITY_USD);
  setEngineStateIfMissing(db, 'MAX_SLIPPAGE_BPS', env.MAX_SLIPPAGE_BPS);
  setEngineStateIfMissing(db, 'CONFIDENCE_MIN', env.CONFIDENCE_MIN);
  setEngineStateIfMissing(db, 'EDGE_MIN_BPS', env.EDGE_MIN_BPS);
  setEngineStateIfMissing(db, 'METRIC_OPEN_POSITIONS', 0);
  setEngineStateIfMissing(db, 'METRIC_DAILY_LOSS_USD', 0);
  setEngineStateIfMissing(db, 'METRIC_TOTAL_EXPOSURE_USD', 0);
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

  const marketProvider = new PolymarketMarketProvider({
    gammaBaseUrl: env.POLYMARKET_GAMMA_BASE_URL,
    clobBaseUrl: env.POLYMARKET_CLOB_BASE_URL,
  });
  const executionClient = new DryRunExecutionClient();
  const executionOrchestrator = new TradeExecutionOrchestrator({
    db,
    env,
    logger,
    client: executionClient,
    placementTimeoutMs: env.EXECUTION_TIMEOUT_MS,
  });
  const phase3Simulator = new Phase3Simulator({
    env,
    logger,
    marketProvider,
    orchestrator: executionOrchestrator,
  });

  const server = startOpsServer({ env, db, logger, phase3Simulator });

  const heartbeat = setInterval(() => {
    setEngineState(db, 'last_tick', new Date().toISOString());
  }, env.HEARTBEAT_INTERVAL_MS);

  heartbeat.unref();

  logger.info('Engine boot complete', {
    opsHost: env.OPS_HOST,
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
