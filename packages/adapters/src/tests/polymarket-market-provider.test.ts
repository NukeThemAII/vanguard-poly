import { describe, expect, it } from 'vitest';
import { PolymarketMarketProvider } from '../providers/polymarket-market-provider';

type FetchCall = {
  url: string;
  init: RequestInit;
};

type ResponseLike = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

const jsonResponse = (payload: unknown): ResponseLike => ({
  ok: true,
  status: 200,
  json: async () => payload,
  text: async () => JSON.stringify(payload),
});

describe('PolymarketMarketProvider', () => {
  it('returns trending markets filtered by liquidity and sorted by volume', async () => {
    const calls: FetchCall[] = [];

    const fetchFn = async (url: string, init: RequestInit): Promise<ResponseLike> => {
      calls.push({ url, init });

      if (url.includes('/markets?')) {
        return jsonResponse([
          {
            id: 'm1',
            conditionId: 'c1',
            question: 'Market 1',
            volumeNum: 120000,
            liquidityNum: 20000,
            clobTokenIds: '["token-a","token-b"]',
            bestBid: '0.47',
            bestAsk: '0.49',
          },
          {
            id: 'm2',
            conditionId: 'c2',
            question: 'Market 2',
            volumeNum: 180000,
            liquidityNum: 8000,
            clobTokenIds: ['token-c', 'token-d'],
          },
          {
            id: 'm3',
            conditionId: 'c3',
            question: 'Market 3',
            volumeNum: 100000,
            liquidityNum: 30000,
            clobTokenIds: ['token-e'],
          },
        ]);
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const provider = new PolymarketMarketProvider({
      fetchFn,
      gammaBaseUrl: 'https://gamma.local',
    });

    const result = await provider.getTrendingMarkets({
      limit: 2,
      minLiquidityUsd: 10_000,
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.marketId).toBe('m1');
    expect(result[1]?.marketId).toBe('m3');
    expect(result[0]?.tokenId).toBe('token-a');
    expect(calls[0]?.url.startsWith('https://gamma.local/markets?')).toBe(true);
  });

  it('builds orderbook snapshot with spread and liquidity', async () => {
    const fetchFn = async (url: string): Promise<ResponseLike> => {
      if (url.includes('/book?token_id=token-a')) {
        return jsonResponse({
          bids: [
            { price: '0.45', size: '200' },
            { price: '0.44', size: '100' },
          ],
          asks: [
            { price: '0.47', size: '120' },
            { price: '0.48', size: '80' },
          ],
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const provider = new PolymarketMarketProvider({
      fetchFn,
      clobBaseUrl: 'https://clob.local',
    });

    const snapshot = await provider.getOrderbookSnapshot({
      marketId: 'm1',
      tokenId: 'token-a',
    });

    expect(snapshot.bestBid).toBe(0.45);
    expect(snapshot.bestAsk).toBe(0.47);
    expect(snapshot.spreadBps).toBeCloseTo(((0.47 - 0.45) / 0.47) * 10_000, 8);
    expect(snapshot.liquidityUsd).toBeCloseTo(228.8, 8);
  });

  it('retries transient failures before succeeding', async () => {
    let attempts = 0;

    const fetchFn = async (): Promise<ResponseLike> => {
      attempts += 1;

      if (attempts < 3) {
        return {
          ok: false,
          status: 503,
          json: async () => ({}),
          text: async () => 'service unavailable',
        };
      }

      return jsonResponse({
        bids: [{ price: '0.50', size: '100' }],
        asks: [{ price: '0.51', size: '100' }],
      });
    };

    const provider = new PolymarketMarketProvider({
      fetchFn,
      retryOptions: {
        maxAttempts: 3,
        baseDelayMs: 1,
        maxDelayMs: 1,
      },
      timeoutMs: 100,
    });

    const snapshot = await provider.getOrderbookSnapshot({
      marketId: 'm-r',
      tokenId: 'token-r',
    });

    expect(attempts).toBe(3);
    expect(snapshot.bestBid).toBe(0.5);
  });
});
