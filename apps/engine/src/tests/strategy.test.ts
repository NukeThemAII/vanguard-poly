import type { MarketAdapter } from '@vanguard-poly/adapters';
import type { OrderBookSnapshot, TrendingMarket } from '@vanguard-poly/domain';
import { describe, expect, it } from 'vitest';
import { CandidateSelector } from '../strategy/CandidateSelector';

class StubMarketAdapter implements MarketAdapter {
  readonly providerName = 'stub-market-adapter';

  private readonly markets: TrendingMarket[];

  constructor(markets: TrendingMarket[]) {
    this.markets = markets;
  }

  async getTrendingMarkets(): Promise<TrendingMarket[]> {
    return this.markets;
  }

  async getOrderbookSnapshot(): Promise<OrderBookSnapshot> {
    throw new Error('Orderbook is not used in candidate selector scan test');
  }
}

const makeMarket = (
  input: Partial<TrendingMarket> & { marketId: string; tokenId: string },
): TrendingMarket => ({
  marketId: input.marketId,
  conditionId: input.conditionId ?? input.marketId,
  question: input.question ?? input.marketId,
  tokenId: input.tokenId,
  volumeUsd: input.volumeUsd ?? 0,
  liquidityUsd: input.liquidityUsd ?? 0,
  bestBid: input.bestBid ?? null,
  bestAsk: input.bestAsk ?? null,
  endDate: input.endDate ?? null,
});

describe('CandidateSelector', () => {
  it('returns high-volume candidates while filtering low-liquidity noise', async () => {
    const selector = new CandidateSelector({
      marketAdapter: new StubMarketAdapter([
        makeMarket({
          marketId: 'm-1',
          tokenId: 'token-1',
          question: 'High volume, high liquidity',
          volumeUsd: 300_000,
          liquidityUsd: 30_000,
          bestBid: 0.49,
          bestAsk: 0.51,
        }),
        makeMarket({
          marketId: 'm-2',
          tokenId: 'token-2',
          question: 'Low liquidity noise',
          volumeUsd: 500_000,
          liquidityUsd: 500,
          bestBid: 0.48,
          bestAsk: 0.52,
        }),
        makeMarket({
          marketId: 'm-3',
          tokenId: 'token-3',
          question: 'Mid volume, high liquidity',
          volumeUsd: 150_000,
          liquidityUsd: 20_000,
          bestBid: 0.47,
          bestAsk: 0.5,
        }),
        makeMarket({
          marketId: 'm-4',
          tokenId: '',
          question: 'Invalid token id',
          volumeUsd: 700_000,
          liquidityUsd: 80_000,
        }),
      ]),
      minLiquidityUsd: 10_000,
      maxCandidates: 5,
    });

    const candidates = await selector.scan();

    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.marketId).toBe('m-1');
    expect(candidates[1]?.marketId).toBe('m-3');

    for (const candidate of candidates) {
      expect(candidate.liquidityUsd).toBeGreaterThanOrEqual(10_000);
      expect(candidate.volumeUsd).toBeGreaterThan(0);
      expect(candidate.tokenId.length).toBeGreaterThan(0);
    }
  });
});
