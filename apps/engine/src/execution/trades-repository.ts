import type { TradeSide } from '@vanguard-poly/domain';
import type { SQLiteDatabase } from '../database/db';

export type CreateTradeRecordInput = {
  id: string;
  marketId: string;
  side: TradeSide;
  sizeUsd: number;
  price: number;
  status: string;
  metaJson: string;
};

export const createTradeRecord = (db: SQLiteDatabase, input: CreateTradeRecordInput): void => {
  const statement = db.prepare(
    `
      INSERT OR REPLACE INTO trades (
        id,
        ts,
        market_id,
        side,
        size_usd,
        price,
        status,
        meta_json
      )
      VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?)
    `,
  );

  statement.run(
    input.id,
    input.marketId,
    input.side,
    input.sizeUsd,
    input.price,
    input.status,
    input.metaJson,
  );
};
