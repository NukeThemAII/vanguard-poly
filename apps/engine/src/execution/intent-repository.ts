import type { TimeInForce, TradeSide } from '@vanguard-poly/domain';
import type { SQLiteDatabase } from '../database/db';
import type { ExecutionIntentRecord, ExecutionIntentStatus } from './types';

export type CreateExecutionIntentInput = {
  id: string;
  marketId: string;
  tokenId: string;
  side: TradeSide;
  sizeUsd: number;
  timeInForce: TimeInForce;
  dryRun: boolean;
  status: ExecutionIntentStatus;
  reason: string | null;
  requestJson: string;
};

const mapRecord = (row: {
  id: string;
  ts: string;
  market_id: string;
  token_id: string;
  side: TradeSide;
  size_usd: number;
  tif: TimeInForce;
  dry_run: number;
  status: ExecutionIntentStatus;
  reason: string | null;
  request_json: string;
  response_json: string | null;
  updated_at: string;
}): ExecutionIntentRecord => ({
  id: row.id,
  ts: row.ts,
  marketId: row.market_id,
  tokenId: row.token_id,
  side: row.side,
  sizeUsd: row.size_usd,
  timeInForce: row.tif,
  dryRun: row.dry_run === 1,
  status: row.status,
  reason: row.reason,
  requestJson: row.request_json,
  responseJson: row.response_json,
  updatedAt: row.updated_at,
});

export const getExecutionIntentRecord = (
  db: SQLiteDatabase,
  intentId: string,
): ExecutionIntentRecord | null => {
  const statement = db.prepare<
    { id: string },
    {
      id: string;
      ts: string;
      market_id: string;
      token_id: string;
      side: TradeSide;
      size_usd: number;
      tif: TimeInForce;
      dry_run: number;
      status: ExecutionIntentStatus;
      reason: string | null;
      request_json: string;
      response_json: string | null;
      updated_at: string;
    }
  >('SELECT * FROM execution_intents WHERE id = @id');

  const row = statement.get({ id: intentId });
  return row ? mapRecord(row) : null;
};

export const createExecutionIntent = (
  db: SQLiteDatabase,
  input: CreateExecutionIntentInput,
): ExecutionIntentRecord => {
  const statement = db.prepare(
    `
      INSERT INTO execution_intents (
        id,
        ts,
        market_id,
        token_id,
        side,
        size_usd,
        tif,
        dry_run,
        status,
        reason,
        request_json,
        response_json,
        updated_at
      )
      VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP)
    `,
  );

  statement.run(
    input.id,
    input.marketId,
    input.tokenId,
    input.side,
    input.sizeUsd,
    input.timeInForce,
    input.dryRun ? 1 : 0,
    input.status,
    input.reason,
    input.requestJson,
  );

  const record = getExecutionIntentRecord(db, input.id);

  if (!record) {
    throw new Error(`Failed to load newly created execution intent ${input.id}`);
  }

  return record;
};

export const updateExecutionIntent = (
  db: SQLiteDatabase,
  intentId: string,
  status: ExecutionIntentStatus,
  responseJson: string | null,
  reason: string | null,
): void => {
  const statement = db.prepare(
    `
      UPDATE execution_intents
      SET
        status = ?,
        response_json = ?,
        reason = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
  );

  statement.run(status, responseJson, reason, intentId);
};

export const isTerminalIntentStatus = (status: ExecutionIntentStatus): boolean =>
  ['REJECTED_RISK', 'FILLED', 'PARTIALLY_FILLED', 'UNFILLED', 'CANCELED', 'FAILED'].includes(
    status,
  );
