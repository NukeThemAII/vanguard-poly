import type { RiskCaps } from '@vanguard-poly/domain';
import { DEFAULT_RISK_CAPS, type EngineSafetyState } from '@vanguard-poly/domain';
import type { Env } from '../config/env';
import { getEngineState } from '../database/db';
import type { SQLiteDatabase } from '../database/db';

const readNumber = (
  db: SQLiteDatabase,
  key: string,
  fallback: number,
  minimum = Number.NEGATIVE_INFINITY,
): number => {
  const value = getEngineState<unknown>(db, key, fallback);

  if (typeof value === 'number' && Number.isFinite(value) && value >= minimum) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);

    if (Number.isFinite(parsed) && parsed >= minimum) {
      return parsed;
    }
  }

  return fallback;
};

const readBoolean = (db: SQLiteDatabase, key: string, fallback: boolean): boolean => {
  const value = getEngineState<unknown>(db, key, fallback);

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return fallback;
};

export const loadRuntimeSafetyState = (db: SQLiteDatabase, env: Env): EngineSafetyState => ({
  DRY_RUN: readBoolean(db, 'DRY_RUN', env.DRY_RUN),
  KILL_SWITCH: readBoolean(db, 'KILL_SWITCH', env.KILL_SWITCH),
  ARMED: readBoolean(db, 'ARMED', env.ARMED),
});

export const loadRuntimeRiskCaps = (db: SQLiteDatabase, env: Env): RiskCaps => ({
  MAX_USD_PER_TRADE: readNumber(
    db,
    'MAX_USD_PER_TRADE',
    env.MAX_USD_PER_TRADE ?? DEFAULT_RISK_CAPS.MAX_USD_PER_TRADE,
    0,
  ),
  MAX_OPEN_POSITIONS: readNumber(
    db,
    'MAX_OPEN_POSITIONS',
    env.MAX_OPEN_POSITIONS ?? DEFAULT_RISK_CAPS.MAX_OPEN_POSITIONS,
    1,
  ),
  MAX_DAILY_LOSS_USD: readNumber(
    db,
    'MAX_DAILY_LOSS_USD',
    env.MAX_DAILY_LOSS_USD ?? DEFAULT_RISK_CAPS.MAX_DAILY_LOSS_USD,
    0,
  ),
  MAX_TOTAL_EXPOSURE_USD: readNumber(
    db,
    'MAX_TOTAL_EXPOSURE_USD',
    env.MAX_TOTAL_EXPOSURE_USD ?? DEFAULT_RISK_CAPS.MAX_TOTAL_EXPOSURE_USD,
    0,
  ),
  MIN_LIQUIDITY_USD: readNumber(
    db,
    'MIN_LIQUIDITY_USD',
    env.MIN_LIQUIDITY_USD ?? DEFAULT_RISK_CAPS.MIN_LIQUIDITY_USD,
    0,
  ),
  MAX_SLIPPAGE_BPS: readNumber(
    db,
    'MAX_SLIPPAGE_BPS',
    env.MAX_SLIPPAGE_BPS ?? DEFAULT_RISK_CAPS.MAX_SLIPPAGE_BPS,
    0,
  ),
  CONFIDENCE_MIN: readNumber(
    db,
    'CONFIDENCE_MIN',
    env.CONFIDENCE_MIN ?? DEFAULT_RISK_CAPS.CONFIDENCE_MIN,
    0,
  ),
  EDGE_MIN_BPS: readNumber(
    db,
    'EDGE_MIN_BPS',
    env.EDGE_MIN_BPS ?? DEFAULT_RISK_CAPS.EDGE_MIN_BPS,
    0,
  ),
});

export type RuntimeRiskMetrics = {
  openPositions: number;
  dailyLossUsd: number;
  totalExposureUsd: number;
};

export const loadRuntimeRiskMetrics = (db: SQLiteDatabase): RuntimeRiskMetrics => ({
  openPositions: readNumber(db, 'METRIC_OPEN_POSITIONS', 0, 0),
  dailyLossUsd: readNumber(db, 'METRIC_DAILY_LOSS_USD', 0, 0),
  totalExposureUsd: readNumber(db, 'METRIC_TOTAL_EXPOSURE_USD', 0, 0),
});
