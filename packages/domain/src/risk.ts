import type { RiskCaps } from './types';

export type RiskViolationCode =
  | 'MAX_USD_PER_TRADE'
  | 'MAX_OPEN_POSITIONS'
  | 'MAX_DAILY_LOSS_USD'
  | 'MAX_TOTAL_EXPOSURE_USD'
  | 'MIN_LIQUIDITY_USD'
  | 'MAX_SLIPPAGE_BPS'
  | 'CONFIDENCE_MIN'
  | 'EDGE_MIN_BPS';

export type RiskViolation = {
  code: RiskViolationCode;
  message: string;
  actual: number;
  limit: number;
};

export type RiskEvaluationInput = {
  caps: RiskCaps;
  tradeSizeUsd: number;
  openPositions: number;
  dailyLossUsd: number;
  totalExposureUsd: number;
  marketLiquidityUsd: number;
  estimatedSlippageBps: number;
  confidence: number;
  edgeBps: number;
};

export type RiskEvaluationResult = {
  allowed: boolean;
  violations: RiskViolation[];
  projectedExposureUsd: number;
};

const makeViolation = (
  code: RiskViolationCode,
  message: string,
  actual: number,
  limit: number,
): RiskViolation => ({
  code,
  message,
  actual,
  limit,
});

export const evaluateRiskCaps = ({
  caps,
  tradeSizeUsd,
  openPositions,
  dailyLossUsd,
  totalExposureUsd,
  marketLiquidityUsd,
  estimatedSlippageBps,
  confidence,
  edgeBps,
}: RiskEvaluationInput): RiskEvaluationResult => {
  const violations: RiskViolation[] = [];

  if (tradeSizeUsd > caps.MAX_USD_PER_TRADE) {
    violations.push(
      makeViolation(
        'MAX_USD_PER_TRADE',
        'Trade size exceeds MAX_USD_PER_TRADE',
        tradeSizeUsd,
        caps.MAX_USD_PER_TRADE,
      ),
    );
  }

  const projectedOpenPositions = openPositions + 1;
  if (projectedOpenPositions > caps.MAX_OPEN_POSITIONS) {
    violations.push(
      makeViolation(
        'MAX_OPEN_POSITIONS',
        'Projected open positions exceed MAX_OPEN_POSITIONS',
        projectedOpenPositions,
        caps.MAX_OPEN_POSITIONS,
      ),
    );
  }

  if (dailyLossUsd > caps.MAX_DAILY_LOSS_USD) {
    violations.push(
      makeViolation(
        'MAX_DAILY_LOSS_USD',
        'Daily loss exceeds MAX_DAILY_LOSS_USD',
        dailyLossUsd,
        caps.MAX_DAILY_LOSS_USD,
      ),
    );
  }

  const projectedExposureUsd = totalExposureUsd + tradeSizeUsd;
  if (projectedExposureUsd > caps.MAX_TOTAL_EXPOSURE_USD) {
    violations.push(
      makeViolation(
        'MAX_TOTAL_EXPOSURE_USD',
        'Projected exposure exceeds MAX_TOTAL_EXPOSURE_USD',
        projectedExposureUsd,
        caps.MAX_TOTAL_EXPOSURE_USD,
      ),
    );
  }

  if (marketLiquidityUsd < caps.MIN_LIQUIDITY_USD) {
    violations.push(
      makeViolation(
        'MIN_LIQUIDITY_USD',
        'Market liquidity is below MIN_LIQUIDITY_USD',
        marketLiquidityUsd,
        caps.MIN_LIQUIDITY_USD,
      ),
    );
  }

  if (estimatedSlippageBps > caps.MAX_SLIPPAGE_BPS) {
    violations.push(
      makeViolation(
        'MAX_SLIPPAGE_BPS',
        'Estimated slippage exceeds MAX_SLIPPAGE_BPS',
        estimatedSlippageBps,
        caps.MAX_SLIPPAGE_BPS,
      ),
    );
  }

  if (confidence < caps.CONFIDENCE_MIN) {
    violations.push(
      makeViolation(
        'CONFIDENCE_MIN',
        'Confidence is below CONFIDENCE_MIN',
        confidence,
        caps.CONFIDENCE_MIN,
      ),
    );
  }

  if (edgeBps < caps.EDGE_MIN_BPS) {
    violations.push(
      makeViolation('EDGE_MIN_BPS', 'Edge is below EDGE_MIN_BPS', edgeBps, caps.EDGE_MIN_BPS),
    );
  }

  return {
    allowed: violations.length === 0,
    violations,
    projectedExposureUsd,
  };
};
