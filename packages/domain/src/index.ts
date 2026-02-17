export type EngineSafetyState = {
  DRY_RUN: boolean;
  KILL_SWITCH: boolean;
  ARMED: boolean;
};

export type RiskCaps = {
  MAX_USD_PER_TRADE: number;
  MAX_OPEN_POSITIONS: number;
  MAX_DAILY_LOSS_USD: number;
  MAX_TOTAL_EXPOSURE_USD: number;
  MIN_LIQUIDITY_USD: number;
  MAX_SLIPPAGE_BPS: number;
  CONFIDENCE_MIN: number;
  EDGE_MIN_BPS: number;
};

export const DEFAULT_RISK_CAPS: RiskCaps = {
  MAX_USD_PER_TRADE: 100,
  MAX_OPEN_POSITIONS: 5,
  MAX_DAILY_LOSS_USD: 250,
  MAX_TOTAL_EXPOSURE_USD: 1000,
  MIN_LIQUIDITY_USD: 10_000,
  MAX_SLIPPAGE_BPS: 50,
  CONFIDENCE_MIN: 0.85,
  EDGE_MIN_BPS: 100,
};
