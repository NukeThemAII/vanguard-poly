import type { TimeInForce, TradeSide } from '@vanguard-poly/domain';
import type { Logger } from 'winston';
import type { Env } from '../config/env';
import type { TradeExecutionOrchestrator } from '../execution/orchestrator';
import type { TradeExecutionResult } from '../execution/types';
import type { IMarketDataProvider } from '@vanguard-poly/adapters';

export type SimulateTradeInput = {
  marketId?: string | undefined;
  tokenId?: string | undefined;
  side?: TradeSide | undefined;
  sizeUsd?: number | undefined;
  confidence?: number | undefined;
  edgeBps?: number | undefined;
  timeInForce?: TimeInForce | undefined;
};

export type SimulateTradeResult = {
  selectedMarketId: string;
  selectedTokenId: string;
  execution: TradeExecutionResult;
};

export class Phase3Simulator {
  private readonly env: Env;

  private readonly logger: Logger;

  private readonly marketProvider: IMarketDataProvider;

  private readonly orchestrator: TradeExecutionOrchestrator;

  constructor({
    env,
    logger,
    marketProvider,
    orchestrator,
  }: {
    env: Env;
    logger: Logger;
    marketProvider: IMarketDataProvider;
    orchestrator: TradeExecutionOrchestrator;
  }) {
    this.env = env;
    this.logger = logger;
    this.marketProvider = marketProvider;
    this.orchestrator = orchestrator;
  }

  async simulateTrade(input: SimulateTradeInput = {}): Promise<SimulateTradeResult> {
    let marketId = input.marketId;
    let tokenId = input.tokenId;

    if (!marketId || !tokenId) {
      const markets = await this.marketProvider.getTrendingMarkets({
        limit: 1,
        minLiquidityUsd: this.env.MIN_LIQUIDITY_USD,
      });

      const market = markets[0];

      if (!market) {
        throw new Error('No eligible trending markets found for simulation');
      }

      marketId = market.marketId;
      tokenId = market.tokenId;
    }

    const snapshot = await this.marketProvider.getOrderbookSnapshot({ marketId, tokenId });

    const sizeUsd = Math.min(
      input.sizeUsd ?? this.env.MAX_USD_PER_TRADE,
      this.env.MAX_USD_PER_TRADE,
    );
    const confidence = Math.max(
      input.confidence ?? this.env.CONFIDENCE_MIN + 0.02,
      this.env.CONFIDENCE_MIN,
    );
    const edgeBps = Math.max(input.edgeBps ?? this.env.EDGE_MIN_BPS + 5, this.env.EDGE_MIN_BPS);

    const execution = await this.orchestrator.executeDryRunTrade({
      marketId,
      tokenId,
      side: input.side ?? 'BUY',
      sizeUsd,
      confidence,
      edgeBps,
      timeInForce: input.timeInForce ?? 'IOC',
      orderbook: snapshot,
    });

    this.logger.info('Phase3 dry-run simulation finished', {
      marketId,
      tokenId,
      status: execution.status,
      intentId: execution.intentId,
    });

    return {
      selectedMarketId: marketId,
      selectedTokenId: tokenId,
      execution,
    };
  }
}
