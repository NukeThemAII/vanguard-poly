import { randomUUID } from 'node:crypto';
import { evaluateRiskCaps } from '@vanguard-poly/domain';
import type { Logger } from 'winston';
import type { Env } from '../config/env';
import type { SQLiteDatabase } from '../database/db';
import {
  loadRuntimeRiskCaps,
  loadRuntimeRiskMetrics,
  loadRuntimeSafetyState,
} from '../phase3/runtime-config';
import {
  createExecutionIntent,
  getExecutionIntentRecord,
  isTerminalIntentStatus,
  updateExecutionIntent,
} from './intent-repository';
import { createTradeRecord } from './trades-repository';
import type { ExecutionClient, TradeExecutionRequest, TradeExecutionResult } from './types';

const mapPlacementStatus = (status: 'FILLED' | 'PARTIALLY_FILLED' | 'UNFILLED' | 'CANCELED') =>
  status;

const withTimeout = async <T>(
  task: () => Promise<T>,
  timeoutMs: number,
  onTimeout: () => Promise<void>,
): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Execution timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([task(), timeoutPromise]);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('Execution timeout')) {
      await onTimeout();
    }

    throw error;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

export type TradeExecutionOrchestratorOptions = {
  db: SQLiteDatabase;
  env: Env;
  logger: Logger;
  client: ExecutionClient;
  placementTimeoutMs?: number;
};

export class TradeExecutionOrchestrator {
  private readonly db: SQLiteDatabase;

  private readonly env: Env;

  private readonly logger: Logger;

  private readonly client: ExecutionClient;

  private readonly placementTimeoutMs: number;

  constructor({
    db,
    env,
    logger,
    client,
    placementTimeoutMs = 2_500,
  }: TradeExecutionOrchestratorOptions) {
    this.db = db;
    this.env = env;
    this.logger = logger;
    this.client = client;
    this.placementTimeoutMs = placementTimeoutMs;
  }

  async executeDryRunTrade(request: TradeExecutionRequest): Promise<TradeExecutionResult> {
    const safety = loadRuntimeSafetyState(this.db, this.env);
    const caps = loadRuntimeRiskCaps(this.db, this.env);
    const metrics = loadRuntimeRiskMetrics(this.db);

    const estimatedSlippage = Math.max(request.orderbook.spreadBps ?? 0, 0);

    const risk = evaluateRiskCaps({
      caps,
      tradeSizeUsd: request.sizeUsd,
      openPositions: metrics.openPositions,
      dailyLossUsd: metrics.dailyLossUsd,
      totalExposureUsd: metrics.totalExposureUsd,
      marketLiquidityUsd: request.orderbook.liquidityUsd,
      estimatedSlippageBps: estimatedSlippage,
      confidence: request.confidence,
      edgeBps: request.edgeBps,
    });

    if (!safety.DRY_RUN) {
      return {
        intentId: null,
        placement: null,
        risk,
        status: 'FAILED',
        reason: 'DRY_RUN_DISABLED_FOR_PHASE3',
      };
    }

    if (!risk.allowed) {
      this.logger.warn('Risk rejected dry-run trade', {
        marketId: request.marketId,
        tokenId: request.tokenId,
        violations: risk.violations,
      });

      return {
        intentId: null,
        placement: null,
        risk,
        status: 'REJECTED_RISK',
        reason: 'RISK_LIMITS_FAILED',
      };
    }

    const intentId = request.executionIntentId ?? randomUUID();
    const existing = getExecutionIntentRecord(this.db, intentId);

    if (existing && isTerminalIntentStatus(existing.status)) {
      this.logger.info('Skipping placement for terminal execution intent', {
        intentId,
        status: existing.status,
      });

      return {
        intentId,
        placement: null,
        risk,
        status: existing.status,
        reason: existing.reason,
      };
    }

    if (!existing) {
      createExecutionIntent(this.db, {
        id: intentId,
        marketId: request.marketId,
        tokenId: request.tokenId,
        side: request.side,
        sizeUsd: request.sizeUsd,
        timeInForce: request.timeInForce ?? 'IOC',
        dryRun: true,
        status: 'PENDING',
        reason: null,
        requestJson: JSON.stringify(request),
      });
    }

    try {
      const placement = await withTimeout(
        () =>
          this.client.placeOrder({
            intentId,
            marketId: request.marketId,
            tokenId: request.tokenId,
            side: request.side,
            sizeUsd: request.sizeUsd,
            timeInForce: request.timeInForce ?? 'IOC',
            orderbook: request.orderbook,
            maxSlippageBps: caps.MAX_SLIPPAGE_BPS,
          }),
        this.placementTimeoutMs,
        async () => {
          await this.client.cancelOrder(intentId);
        },
      );

      const status = mapPlacementStatus(placement.status);

      updateExecutionIntent(this.db, intentId, status, JSON.stringify(placement), placement.reason);

      if (placement.filledSizeUsd > 0 && placement.avgPrice !== null) {
        createTradeRecord(this.db, {
          id: `${intentId}:fill`,
          marketId: request.marketId,
          side: request.side,
          sizeUsd: placement.filledSizeUsd,
          price: placement.avgPrice,
          status: `DRY_RUN_${placement.status}`,
          metaJson: JSON.stringify({
            intentId,
            tokenId: request.tokenId,
            slippageBps: placement.slippageBps,
            fillCount: placement.fillCount,
            reason: placement.reason,
          }),
        });
      }

      this.logger.info('Dry-run execution complete', {
        intentId,
        marketId: request.marketId,
        status,
      });

      return {
        intentId,
        placement,
        risk,
        status,
        reason: placement.reason,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Execution failure';
      updateExecutionIntent(this.db, intentId, 'FAILED', null, message);

      this.logger.error('Dry-run execution failed', {
        intentId,
        marketId: request.marketId,
        error: message,
      });

      return {
        intentId,
        placement: null,
        risk,
        status: 'FAILED',
        reason: message,
      };
    }
  }
}
