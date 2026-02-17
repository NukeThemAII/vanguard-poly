import type { MarketAdapter } from '@vanguard-poly/adapters';
import type { TrendingMarket } from '@vanguard-poly/domain';

export type CandidateSelectorOptions = {
  marketAdapter: MarketAdapter;
  minLiquidityUsd: number;
  scanLimit?: number;
  maxCandidates?: number;
};

export type StrategyCandidate = {
  marketId: string;
  tokenId: string;
  question: string;
  volumeUsd: number;
  liquidityUsd: number;
  bestBid: number | null;
  bestAsk: number | null;
  spreadBps: number | null;
};

const computeSpreadBps = (bestBid: number | null, bestAsk: number | null): number | null => {
  if (bestBid === null || bestAsk === null || bestBid <= 0 || bestAsk <= 0) {
    return null;
  }

  return ((bestAsk - bestBid) / bestAsk) * 10_000;
};

const toCandidate = (market: TrendingMarket): StrategyCandidate => ({
  marketId: market.marketId,
  tokenId: market.tokenId,
  question: market.question,
  volumeUsd: market.volumeUsd,
  liquidityUsd: market.liquidityUsd,
  bestBid: market.bestBid,
  bestAsk: market.bestAsk,
  spreadBps: computeSpreadBps(market.bestBid, market.bestAsk),
});

export class CandidateSelector {
  private readonly marketAdapter: MarketAdapter;

  private readonly minLiquidityUsd: number;

  private readonly scanLimit: number;

  private readonly maxCandidates: number;

  constructor({
    marketAdapter,
    minLiquidityUsd,
    scanLimit = 50,
    maxCandidates = 10,
  }: CandidateSelectorOptions) {
    this.marketAdapter = marketAdapter;
    this.minLiquidityUsd = minLiquidityUsd;
    this.scanLimit = scanLimit;
    this.maxCandidates = maxCandidates;
  }

  async scan(): Promise<StrategyCandidate[]> {
    const markets = await this.marketAdapter.getTrendingMarkets({
      limit: this.scanLimit,
      minLiquidityUsd: this.minLiquidityUsd,
    });

    return markets
      .filter((market) => market.tokenId.trim().length > 0)
      .filter((market) => market.liquidityUsd >= this.minLiquidityUsd)
      .filter((market) => market.volumeUsd > 0)
      .sort((a, b) => {
        if (b.volumeUsd !== a.volumeUsd) {
          return b.volumeUsd - a.volumeUsd;
        }

        return b.liquidityUsd - a.liquidityUsd;
      })
      .slice(0, this.maxCandidates)
      .map(toCandidate);
  }
}
