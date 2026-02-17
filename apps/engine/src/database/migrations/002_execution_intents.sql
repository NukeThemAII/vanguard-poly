CREATE TABLE IF NOT EXISTS execution_intents (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  market_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  side TEXT NOT NULL,
  size_usd REAL NOT NULL,
  tif TEXT NOT NULL,
  dry_run INTEGER NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  request_json TEXT NOT NULL,
  response_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_execution_intents_ts ON execution_intents (ts);
CREATE INDEX IF NOT EXISTS idx_execution_intents_status ON execution_intents (status);
