CREATE TABLE IF NOT EXISTS engine_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  market_id TEXT NOT NULL,
  side TEXT NOT NULL,
  size_usd REAL NOT NULL,
  price REAL NOT NULL,
  status TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  market_id TEXT NOT NULL,
  confidence REAL NOT NULL,
  edge_bps REAL NOT NULL,
  rationale_hash TEXT NOT NULL,
  raw_json TEXT NOT NULL
);
