import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { OrderBookSnapshot } from '@vanguard-poly/domain';
import { createAppLogger } from '@vanguard-poly/utils';
import { afterEach, describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env';
import { openDatabase, setEngineState } from '../database/db';
import { runMigrations } from '../database/migrate';
import { getExecutionIntentRecord } from '../execution/intent-repository';
import { TradeExecutionOrchestrator } from '../execution/orchestrator';
import type { ExecutionClient, ExecutionPlacementRequest } from '../execution/types';

type ResponseFixture = {
  status: 'FILLED' | 'PARTIALLY_FILLED' | 'UNFILLED' | 'CANCELED';
  filledSizeUsd: number;
  avgPrice: number | null;
  slippageBps: number | null;
  fillCount: number;
  reason: string | null;
};

class SpyExecutionClient implements ExecutionClient {
  private readonly responseFixture: ResponseFixture;

  private readonly onPlace: (request: ExecutionPlacementRequest) => void;

  placeCalls = 0;

  cancelCalls = 0;

  constructor(
    responseFixture: ResponseFixture,
    onPlace: (request: ExecutionPlacementRequest) => void = () => {},
  ) {
    this.responseFixture = responseFixture;
    this.onPlace = onPlace;
  }

  async placeOrder(request: ExecutionPlacementRequest) {
    this.placeCalls += 1;
    this.onPlace(request);

    return {
      ...this.responseFixture,
      externalOrderId: `dryrun:${request.intentId}`,
    };
  }

  async cancelOrder(): Promise<void> {
    this.cancelCalls += 1;
  }
}

const tempPaths: string[] = [];

afterEach(() => {
  for (const tempPath of tempPaths) {
    fs.rmSync(tempPath, { recursive: true, force: true });
  }

  tempPaths.length = 0;
});

const createSnapshot = (): OrderBookSnapshot => ({
  marketId: 'm-1',
  tokenId: 'token-1',
  bids: [{ price: 0.499, size: 10_000 }],
  asks: [{ price: 0.5, size: 10_000 }],
  bestBid: 0.499,
  bestAsk: 0.5,
  spreadBps: 20,
  liquidityUsd: 12_000,
  timestamp: new Date().toISOString(),
});

describe('TradeExecutionOrchestrator', () => {
  it('rejects trade when risk checks fail', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-exec-risk-'));
    tempPaths.push(tempDir);

    const db = openDatabase(path.join(tempDir, 'engine.db'));
    runMigrations(db, path.join(__dirname, '../database/migrations'));

    const env = loadEnv({
      VANGUARD_TOKEN: 'token',
      DB_PATH: path.join(tempDir, 'engine.db'),
    });

    const client = new SpyExecutionClient({
      status: 'FILLED',
      filledSizeUsd: 50,
      avgPrice: 0.5,
      slippageBps: 10,
      fillCount: 1,
      reason: null,
    });

    const orchestrator = new TradeExecutionOrchestrator({
      db,
      env,
      logger: createAppLogger({
        service: 'exec-risk-test',
        logDir: path.join(tempDir, 'logs'),
        level: 'error',
      }),
      client,
    });

    const result = await orchestrator.executeDryRunTrade({
      marketId: 'm-1',
      tokenId: 'token-1',
      side: 'BUY',
      sizeUsd: env.MAX_USD_PER_TRADE,
      confidence: env.CONFIDENCE_MIN,
      edgeBps: env.EDGE_MIN_BPS,
      timeInForce: 'IOC',
      orderbook: {
        ...createSnapshot(),
        liquidityUsd: 100,
      },
      executionIntentId: 'intent-risk-reject',
    });

    expect(result.status).toBe('REJECTED_RISK');
    expect(result.intentId).toBeNull();
    expect(client.placeCalls).toBe(0);

    db.close();
  });

  it('persists execution intent before placement and avoids duplicate placement on retry', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-exec-ok-'));
    tempPaths.push(tempDir);

    const db = openDatabase(path.join(tempDir, 'engine.db'));
    runMigrations(db, path.join(__dirname, '../database/migrations'));

    setEngineState(db, 'MIN_LIQUIDITY_USD', 100);
    setEngineState(db, 'MAX_SLIPPAGE_BPS', 50);

    const env = loadEnv({
      VANGUARD_TOKEN: 'token',
      DB_PATH: path.join(tempDir, 'engine.db'),
    });

    const client = new SpyExecutionClient(
      {
        status: 'FILLED',
        filledSizeUsd: 80,
        avgPrice: 0.5,
        slippageBps: 10,
        fillCount: 1,
        reason: null,
      },
      (request) => {
        const persistedIntent = getExecutionIntentRecord(db, request.intentId);
        expect(persistedIntent).not.toBeNull();
        expect(persistedIntent?.status).toBe('PENDING');
      },
    );

    const orchestrator = new TradeExecutionOrchestrator({
      db,
      env,
      logger: createAppLogger({
        service: 'exec-ok-test',
        logDir: path.join(tempDir, 'logs'),
        level: 'error',
      }),
      client,
    });

    const first = await orchestrator.executeDryRunTrade({
      marketId: 'm-1',
      tokenId: 'token-1',
      side: 'BUY',
      sizeUsd: 80,
      confidence: 0.95,
      edgeBps: 150,
      timeInForce: 'IOC',
      orderbook: createSnapshot(),
      executionIntentId: 'intent-idempotent',
    });

    expect(first.status).toBe('FILLED');
    expect(first.intentId).toBe('intent-idempotent');
    expect(client.placeCalls).toBe(1);

    const second = await orchestrator.executeDryRunTrade({
      marketId: 'm-1',
      tokenId: 'token-1',
      side: 'BUY',
      sizeUsd: 80,
      confidence: 0.95,
      edgeBps: 150,
      timeInForce: 'IOC',
      orderbook: createSnapshot(),
      executionIntentId: 'intent-idempotent',
    });

    expect(second.status).toBe('FILLED');
    expect(second.intentId).toBe('intent-idempotent');
    expect(client.placeCalls).toBe(1);

    const tradesCount = db
      .prepare<[], { count: number }>('SELECT COUNT(*) as count FROM trades')
      .get();
    expect(tradesCount?.count).toBe(1);

    db.close();
  });
});
