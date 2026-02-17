import type { OrderBookLevel, TradeSide } from '@vanguard-poly/domain';
import type { ExecutionClient, ExecutionPlacementRequest, ExecutionPlacementResult } from './types';

type FillComputation = {
  filledSizeUsd: number;
  avgPrice: number | null;
  slippageBps: number | null;
  fillCount: number;
  fullyFilled: boolean;
};

const computeReferencePrice = (
  side: TradeSide,
  bestBid: number | null,
  bestAsk: number | null,
): number | null => {
  if (side === 'BUY') {
    return bestAsk;
  }

  return bestBid;
};

const computeSlippageBps = (
  side: TradeSide,
  referencePrice: number | null,
  avgPrice: number | null,
): number | null => {
  if (referencePrice === null || avgPrice === null || referencePrice <= 0) {
    return null;
  }

  if (side === 'BUY') {
    return ((avgPrice - referencePrice) / referencePrice) * 10_000;
  }

  return ((referencePrice - avgPrice) / referencePrice) * 10_000;
};

const selectLevels = (
  side: TradeSide,
  bids: OrderBookLevel[],
  asks: OrderBookLevel[],
): OrderBookLevel[] => {
  if (side === 'BUY') {
    return asks;
  }

  return bids;
};

const computeFill = (
  side: TradeSide,
  targetUsd: number,
  bids: OrderBookLevel[],
  asks: OrderBookLevel[],
): FillComputation => {
  const levels = selectLevels(side, bids, asks);

  let remainingUsd = targetUsd;
  let consumedUsd = 0;
  let consumedShares = 0;
  let fillCount = 0;

  for (const level of levels) {
    if (remainingUsd <= 0) {
      break;
    }

    const availableUsd = level.price * level.size;

    if (availableUsd <= 0) {
      continue;
    }

    const takeUsd = Math.min(remainingUsd, availableUsd);
    const takeShares = takeUsd / level.price;

    consumedUsd += takeUsd;
    consumedShares += takeShares;
    remainingUsd -= takeUsd;
    fillCount += 1;
  }

  const avgPrice = consumedShares > 0 ? consumedUsd / consumedShares : null;

  return {
    filledSizeUsd: consumedUsd,
    avgPrice,
    slippageBps: null,
    fillCount,
    fullyFilled: remainingUsd <= 1e-9,
  };
};

export class DryRunExecutionClient implements ExecutionClient {
  async placeOrder(request: ExecutionPlacementRequest): Promise<ExecutionPlacementResult> {
    const computed = computeFill(
      request.side,
      request.sizeUsd,
      request.orderbook.bids,
      request.orderbook.asks,
    );

    const referencePrice = computeReferencePrice(
      request.side,
      request.orderbook.bestBid,
      request.orderbook.bestAsk,
    );

    const slippageBps = computeSlippageBps(request.side, referencePrice, computed.avgPrice);

    if (request.timeInForce === 'FOK' && !computed.fullyFilled) {
      return {
        status: 'CANCELED',
        filledSizeUsd: 0,
        avgPrice: null,
        slippageBps: null,
        fillCount: 0,
        reason: 'FOK_NOT_FULLY_FILLABLE',
        externalOrderId: `dryrun:${request.intentId}`,
      };
    }

    if (slippageBps !== null && slippageBps > request.maxSlippageBps) {
      return {
        status: 'CANCELED',
        filledSizeUsd: 0,
        avgPrice: null,
        slippageBps,
        fillCount: 0,
        reason: 'MAX_SLIPPAGE_EXCEEDED',
        externalOrderId: `dryrun:${request.intentId}`,
      };
    }

    if (computed.filledSizeUsd <= 0) {
      return {
        status: 'UNFILLED',
        filledSizeUsd: 0,
        avgPrice: null,
        slippageBps,
        fillCount: 0,
        reason: 'NO_LIQUIDITY',
        externalOrderId: `dryrun:${request.intentId}`,
      };
    }

    if (computed.fullyFilled) {
      return {
        status: 'FILLED',
        filledSizeUsd: computed.filledSizeUsd,
        avgPrice: computed.avgPrice,
        slippageBps,
        fillCount: computed.fillCount,
        reason: null,
        externalOrderId: `dryrun:${request.intentId}`,
      };
    }

    return {
      status: 'PARTIALLY_FILLED',
      filledSizeUsd: computed.filledSizeUsd,
      avgPrice: computed.avgPrice,
      slippageBps,
      fillCount: computed.fillCount,
      reason: 'IOC_PARTIAL_FILL',
      externalOrderId: `dryrun:${request.intentId}`,
    };
  }

  async cancelOrder(_intentId: string): Promise<void> {
    return Promise.resolve();
  }
}
