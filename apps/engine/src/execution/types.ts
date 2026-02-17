import type {
  OrderBookSnapshot,
  RiskEvaluationResult,
  TimeInForce,
  TradeSide,
} from '@vanguard-poly/domain';

export type ExecutionIntentStatus =
  | 'PENDING'
  | 'REJECTED_RISK'
  | 'FILLED'
  | 'PARTIALLY_FILLED'
  | 'UNFILLED'
  | 'CANCELED'
  | 'FAILED';

export type ExecutionIntentRecord = {
  id: string;
  ts: string;
  marketId: string;
  tokenId: string;
  side: TradeSide;
  sizeUsd: number;
  timeInForce: TimeInForce;
  dryRun: boolean;
  status: ExecutionIntentStatus;
  reason: string | null;
  requestJson: string;
  responseJson: string | null;
  updatedAt: string;
};

export type ExecutionPlacementRequest = {
  intentId: string;
  marketId: string;
  tokenId: string;
  side: TradeSide;
  sizeUsd: number;
  timeInForce: TimeInForce;
  orderbook: OrderBookSnapshot;
  maxSlippageBps: number;
};

export type ExecutionPlacementResult = {
  status: 'FILLED' | 'PARTIALLY_FILLED' | 'UNFILLED' | 'CANCELED';
  filledSizeUsd: number;
  avgPrice: number | null;
  slippageBps: number | null;
  fillCount: number;
  reason: string | null;
  externalOrderId: string;
};

export type ExecutionClient = {
  placeOrder(request: ExecutionPlacementRequest): Promise<ExecutionPlacementResult>;
  cancelOrder(intentId: string): Promise<void>;
};

export type TradeExecutionRequest = {
  marketId: string;
  tokenId: string;
  side: TradeSide;
  sizeUsd: number;
  confidence: number;
  edgeBps: number;
  timeInForce?: TimeInForce;
  orderbook: OrderBookSnapshot;
  executionIntentId?: string;
};

export type TradeExecutionResult = {
  intentId: string | null;
  placement: ExecutionPlacementResult | null;
  risk: RiskEvaluationResult;
  status: ExecutionIntentStatus;
  reason: string | null;
};
