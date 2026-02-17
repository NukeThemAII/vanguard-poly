import type { OrderBookLevel, OrderBookSnapshot, TrendingMarket } from '@vanguard-poly/domain';
import { CircuitBreaker, retryWithBackoff } from '@vanguard-poly/utils';
import { z } from 'zod';
import type { IMarketDataProvider, OrderBookRequest, TrendingMarketsRequest } from '../types';

type FetchResponseLike = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

type FetchLike = (url: string, init: RequestInit) => Promise<FetchResponseLike>;

const defaultFetch: FetchLike = async (url, init) => fetch(url, init);

const gammaMarketSchema = z.object({
  id: z.union([z.string(), z.number()]),
  conditionId: z.string().optional(),
  question: z.string().optional(),
  liquidity: z.union([z.string(), z.number()]).optional(),
  liquidityNum: z.union([z.string(), z.number()]).optional(),
  volume: z.union([z.string(), z.number()]).optional(),
  volumeNum: z.union([z.string(), z.number()]).optional(),
  bestBid: z.union([z.string(), z.number()]).optional(),
  bestAsk: z.union([z.string(), z.number()]).optional(),
  endDate: z.string().nullable().optional(),
  endDateIso: z.string().nullable().optional(),
  active: z.boolean().optional(),
  closed: z.boolean().optional(),
  clobTokenIds: z.unknown().optional(),
});

const orderBookLevelSchema = z.object({
  price: z.union([z.string(), z.number()]),
  size: z.union([z.string(), z.number()]),
});

const bookSchema = z.object({
  bids: z.array(orderBookLevelSchema).default([]),
  asks: z.array(orderBookLevelSchema).default([]),
});

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
};

const parseTokenIds = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;

        if (Array.isArray(parsed)) {
          return parsed.filter((item): item is string => typeof item === 'string');
        }
      } catch {
        return [];
      }
    }

    if (trimmed.length > 0) {
      return [trimmed];
    }
  }

  return [];
};

const normalizeGammaPayload = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload !== null && typeof payload === 'object') {
    const value = payload as Record<string, unknown>;

    if (Array.isArray(value.data)) {
      return value.data;
    }

    if (Array.isArray(value.markets)) {
      return value.markets;
    }
  }

  return [];
};

const toOrderBookLevels = (
  levels: Array<{ price: string | number; size: string | number }>,
): OrderBookLevel[] =>
  levels
    .map((level) => ({
      price: toNumber(level.price),
      size: toNumber(level.size),
    }))
    .filter((level) => level.price > 0 && level.size > 0);

const computeLiquidityUsd = (bids: OrderBookLevel[], asks: OrderBookLevel[]): number =>
  [...bids, ...asks].reduce((acc, level) => acc + level.price * level.size, 0);

const computeSpreadBps = (bestBid: number | null, bestAsk: number | null): number | null => {
  if (bestBid === null || bestAsk === null || bestBid <= 0 || bestAsk <= 0) {
    return null;
  }

  return ((bestAsk - bestBid) / bestAsk) * 10_000;
};

export type PolymarketMarketProviderOptions = {
  gammaBaseUrl?: string;
  clobBaseUrl?: string;
  timeoutMs?: number;
  fetchFn?: FetchLike;
  retryOptions?: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
  };
  circuitOptions?: {
    failureThreshold: number;
    resetTimeoutMs: number;
    now?: () => number;
  };
};

export class PolymarketMarketProvider implements IMarketDataProvider {
  readonly providerName = 'polymarket';

  private readonly gammaBaseUrl: string;

  private readonly clobBaseUrl: string;

  private readonly timeoutMs: number;

  private readonly fetchFn: FetchLike;

  private readonly circuitBreaker: CircuitBreaker;

  private readonly retryOptions: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
  };

  constructor({
    gammaBaseUrl = 'https://gamma-api.polymarket.com',
    clobBaseUrl = 'https://clob.polymarket.com',
    timeoutMs = 8_000,
    fetchFn = defaultFetch,
    retryOptions = {
      maxAttempts: 3,
      baseDelayMs: 200,
      maxDelayMs: 1_500,
    },
    circuitOptions = {
      failureThreshold: 3,
      resetTimeoutMs: 5_000,
    },
  }: PolymarketMarketProviderOptions = {}) {
    this.gammaBaseUrl = gammaBaseUrl.replace(/\/$/, '');
    this.clobBaseUrl = clobBaseUrl.replace(/\/$/, '');
    this.timeoutMs = timeoutMs;
    this.fetchFn = fetchFn;
    this.retryOptions = retryOptions;
    this.circuitBreaker = new CircuitBreaker(circuitOptions);
  }

  private async fetchJson(url: string): Promise<unknown> {
    const call = async (): Promise<unknown> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, this.timeoutMs);

      try {
        const response = await this.fetchFn(url, {
          method: 'GET',
          headers: {
            accept: 'application/json',
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Polymarket HTTP ${response.status}: ${errorText.slice(0, 200)}`);
        }

        return await response.json();
      } finally {
        clearTimeout(timeout);
      }
    };

    return this.circuitBreaker.run(() =>
      retryWithBackoff(call, () => true, {
        maxAttempts: this.retryOptions.maxAttempts,
        baseDelayMs: this.retryOptions.baseDelayMs,
        maxDelayMs: this.retryOptions.maxDelayMs,
      }),
    );
  }

  async getTrendingMarkets({ limit = 10, minLiquidityUsd = 10_000 }: TrendingMarketsRequest = {}) {
    const query = new URLSearchParams({
      limit: String(Math.max(limit * 3, 25)),
      closed: 'false',
      active: 'true',
    });

    const payload = await this.fetchJson(`${this.gammaBaseUrl}/markets?${query.toString()}`);
    const parsed = normalizeGammaPayload(payload)
      .map((item) => gammaMarketSchema.safeParse(item))
      .filter(
        (result): result is { success: true; data: z.infer<typeof gammaMarketSchema> } =>
          result.success,
      )
      .map(({ data }) => {
        const tokenIds = parseTokenIds(data.clobTokenIds);
        const tokenId = tokenIds[0] ?? '';

        const liquidityUsd = Math.max(toNumber(data.liquidityNum), toNumber(data.liquidity), 0);

        const volumeUsd = Math.max(toNumber(data.volumeNum), toNumber(data.volume), 0);

        const market: TrendingMarket = {
          marketId: String(data.id),
          conditionId: data.conditionId ?? String(data.id),
          question: data.question ?? 'Untitled market',
          tokenId,
          volumeUsd,
          liquidityUsd,
          bestBid: toNumber(data.bestBid, NaN),
          bestAsk: toNumber(data.bestAsk, NaN),
          endDate: data.endDateIso ?? data.endDate ?? null,
        };

        return {
          ...market,
          bestBid: Number.isNaN(market.bestBid) ? null : market.bestBid,
          bestAsk: Number.isNaN(market.bestAsk) ? null : market.bestAsk,
        };
      })
      .filter((market) => market.tokenId.length > 0)
      .filter((market) => market.liquidityUsd >= minLiquidityUsd)
      .sort((a, b) => {
        if (b.volumeUsd !== a.volumeUsd) {
          return b.volumeUsd - a.volumeUsd;
        }

        return b.liquidityUsd - a.liquidityUsd;
      })
      .slice(0, limit);

    return parsed;
  }

  async getOrderbookSnapshot({ marketId, tokenId }: OrderBookRequest): Promise<OrderBookSnapshot> {
    const payload = await this.fetchJson(
      `${this.clobBaseUrl}/book?token_id=${encodeURIComponent(tokenId)}`,
    );

    const parsed = bookSchema.parse(payload);

    const bids = toOrderBookLevels(parsed.bids).sort((a, b) => b.price - a.price);
    const asks = toOrderBookLevels(parsed.asks).sort((a, b) => a.price - b.price);

    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;

    return {
      marketId,
      tokenId,
      bids,
      asks,
      bestBid,
      bestAsk,
      spreadBps: computeSpreadBps(bestBid, bestAsk),
      liquidityUsd: computeLiquidityUsd(bids, asks),
      timestamp: new Date().toISOString(),
    };
  }
}
