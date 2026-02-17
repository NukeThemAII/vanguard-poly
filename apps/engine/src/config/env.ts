import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const coerceBoolean = (defaultValue: boolean) =>
  z
    .preprocess((value) => {
      if (typeof value === 'boolean') {
        return value;
      }

      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();

        if (['1', 'true', 'yes', 'on'].includes(normalized)) {
          return true;
        }

        if (['0', 'false', 'no', 'off'].includes(normalized)) {
          return false;
        }
      }

      return value;
    }, z.boolean())
    .default(defaultValue);

const coerceNumber = (schema: z.ZodNumber, defaultValue: number) =>
  z
    .preprocess((value) => {
      if (typeof value === 'number') {
        return value;
      }

      if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? value : parsed;
      }

      return value;
    }, schema)
    .default(defaultValue);

const optionalUrl = z.preprocess((value) => {
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }

  return value;
}, z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  OPS_HOST: z.string().min(1).default('127.0.0.1'),
  OPS_PORT: coerceNumber(z.number().int().positive(), 3077),
  VANGUARD_TOKEN: z.string().min(1, 'VANGUARD_TOKEN is required'),
  DB_PATH: z.string().min(1).default('vanguard.db'),
  HEARTBEAT_INTERVAL_MS: coerceNumber(z.number().int().positive(), 15_000),
  EXECUTION_TIMEOUT_MS: coerceNumber(z.number().int().positive(), 2_500),
  DEAD_MAN_SWITCH_URL: optionalUrl,

  DRY_RUN: coerceBoolean(true),
  KILL_SWITCH: coerceBoolean(true),
  ARMED: coerceBoolean(false),

  MAX_USD_PER_TRADE: coerceNumber(z.number().positive(), 100),
  MAX_OPEN_POSITIONS: coerceNumber(z.number().int().positive(), 5),
  MAX_DAILY_LOSS_USD: coerceNumber(z.number().positive(), 250),
  MAX_TOTAL_EXPOSURE_USD: coerceNumber(z.number().positive(), 1000),
  MIN_LIQUIDITY_USD: coerceNumber(z.number().nonnegative(), 10_000),
  MAX_SLIPPAGE_BPS: coerceNumber(z.number().nonnegative(), 50),
  CONFIDENCE_MIN: coerceNumber(z.number().min(0).max(1), 0.85),
  EDGE_MIN_BPS: coerceNumber(z.number().nonnegative(), 100),

  GEMINI_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  POLYMARKET_GAMMA_BASE_URL: z.string().url().default('https://gamma-api.polymarket.com'),
  POLYMARKET_CLOB_BASE_URL: z.string().url().default('https://clob.polymarket.com'),
  POLYMARKET_API_KEY: z.string().optional(),
  POLYMARKET_SECRET: z.string().optional(),
  WALLET_PRIVATE_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const loadEnv = (source: Record<string, string | undefined> = process.env): Env =>
  envSchema.parse(source);
