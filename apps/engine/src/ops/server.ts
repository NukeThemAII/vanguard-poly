import express, { type NextFunction, type Request, type Response } from 'express';
import type { Logger } from 'winston';
import type { Env } from '../config/env';
import { getEngineState, setEngineState } from '../database/db';
import type { SQLiteDatabase } from '../database/db';

export type OpsServerDependencies = {
  env: Env;
  db: SQLiteDatabase;
  logger: Logger;
  startedAtMs?: number;
};

const CONFIG_ALLOWLIST = new Set([
  'DRY_RUN',
  'MAX_USD_PER_TRADE',
  'MAX_OPEN_POSITIONS',
  'MAX_DAILY_LOSS_USD',
  'MAX_TOTAL_EXPOSURE_USD',
  'MIN_LIQUIDITY_USD',
  'MAX_SLIPPAGE_BPS',
  'CONFIDENCE_MIN',
  'EDGE_MIN_BPS',
]);

const parseConfigValue = (value: unknown): string | number | boolean | null => {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value;
  }

  throw new Error('Unsupported config value type');
};

const requireToken =
  (token: string) =>
  (request: Request, response: Response, next: NextFunction): void => {
    const provided = request.header('x-vanguard-token');

    if (!provided || provided !== token) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    next();
  };

const getRuntimeFlags = (db: SQLiteDatabase, env: Env) => ({
  DRY_RUN: getEngineState<boolean>(db, 'DRY_RUN', env.DRY_RUN),
  KILL_SWITCH: getEngineState<boolean>(db, 'KILL_SWITCH', env.KILL_SWITCH),
  ARMED: getEngineState<boolean>(db, 'ARMED', env.ARMED),
});

const dbHealth = (db: SQLiteDatabase): boolean => {
  try {
    const statement = db.prepare<[], { ok: number }>('SELECT 1 AS ok');
    const result = statement.get();

    if (!result) {
      return false;
    }

    return result.ok === 1;
  } catch {
    return false;
  }
};

export const buildOpsApp = ({
  env,
  db,
  logger,
  startedAtMs = Date.now(),
}: OpsServerDependencies) => {
  const app = express();

  app.use(express.json({ limit: '32kb' }));
  app.use('/ops', requireToken(env.VANGUARD_TOKEN));

  app.get('/ops/status', (_request: Request, response: Response) => {
    response.json({
      ok: true,
      uptimeSeconds: Math.floor((Date.now() - startedAtMs) / 1000),
      states: getRuntimeFlags(db, env),
      deadManSwitch: {
        configured: Boolean(env.DEAD_MAN_SWITCH_URL),
        note: 'Placeholder until Phase 4 strategy loop pings healthcheck URL',
      },
      db: {
        ok: dbHealth(db),
      },
    });
  });

  app.post('/ops/arm', (_request: Request, response: Response) => {
    setEngineState(db, 'ARMED', true);
    logger.warn('Engine armed via ops endpoint');
    response.json({ ok: true, ARMED: true });
  });

  app.post('/ops/disarm', (_request: Request, response: Response) => {
    setEngineState(db, 'ARMED', false);
    logger.warn('Engine disarmed via ops endpoint');
    response.json({ ok: true, ARMED: false });
  });

  app.post('/ops/kill', (_request: Request, response: Response) => {
    setEngineState(db, 'KILL_SWITCH', true);
    logger.warn('Kill switch enabled via ops endpoint');
    response.json({ ok: true, KILL_SWITCH: true });
  });

  app.post('/ops/unkill', (_request: Request, response: Response) => {
    setEngineState(db, 'KILL_SWITCH', false);
    logger.warn('Kill switch disabled via ops endpoint');
    response.json({ ok: true, KILL_SWITCH: false });
  });

  app.post('/ops/config', (request: Request, response: Response) => {
    const payload = request.body as { key?: unknown; value?: unknown };
    const key = typeof payload.key === 'string' ? payload.key : null;

    if (!key || !CONFIG_ALLOWLIST.has(key)) {
      response.status(400).json({
        error: 'Config key not allowed',
        allowedKeys: [...CONFIG_ALLOWLIST],
      });
      return;
    }

    try {
      const value = parseConfigValue(payload.value);
      setEngineState(db, key, value);
      logger.info('Updated runtime config', { key, value });
      response.json({ ok: true, key, value });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Invalid payload';
      response.status(400).json({ error: message });
    }
  });

  return app;
};

export const startOpsServer = (dependencies: OpsServerDependencies) => {
  const { env, logger } = dependencies;
  const app = buildOpsApp(dependencies);

  return app.listen(env.OPS_PORT, () => {
    logger.info('Ops server listening', { port: env.OPS_PORT });
  });
};
