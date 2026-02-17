import { describe, expect, it } from 'vitest';
import { DEFAULT_RISK_CAPS, evaluateRiskCaps } from '../index';

describe('evaluateRiskCaps', () => {
  it('allows trade when all limits pass', () => {
    const result = evaluateRiskCaps({
      caps: DEFAULT_RISK_CAPS,
      tradeSizeUsd: 50,
      openPositions: 1,
      dailyLossUsd: 20,
      totalExposureUsd: 200,
      marketLiquidityUsd: 20_000,
      estimatedSlippageBps: 20,
      confidence: 0.95,
      edgeBps: 150,
    });

    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('reports all violated limits', () => {
    const result = evaluateRiskCaps({
      caps: DEFAULT_RISK_CAPS,
      tradeSizeUsd: 1000,
      openPositions: 5,
      dailyLossUsd: 500,
      totalExposureUsd: 1200,
      marketLiquidityUsd: 100,
      estimatedSlippageBps: 200,
      confidence: 0.5,
      edgeBps: 10,
    });

    expect(result.allowed).toBe(false);
    expect(result.violations.map((item) => item.code)).toEqual([
      'MAX_USD_PER_TRADE',
      'MAX_OPEN_POSITIONS',
      'MAX_DAILY_LOSS_USD',
      'MAX_TOTAL_EXPOSURE_USD',
      'MIN_LIQUIDITY_USD',
      'MAX_SLIPPAGE_BPS',
      'CONFIDENCE_MIN',
      'EDGE_MIN_BPS',
    ]);
  });
});
