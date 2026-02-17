# VANGUARD-POLY

Institutional-grade TypeScript monorepo for a low-latency, LLM-assisted Polymarket trading engine with an OpenClaw Telegram control-plane.

Current state: **Phase 0 + Phase 1 scaffold complete**. No live trading loop is implemented yet.

## Why This Exists

VANGUARD-POLY splits responsibilities for safety and determinism:

- **Engine (`apps/engine`)**: deterministic process for config/state, risk gates, and execution orchestration.
- **OpenClaw (`openclaw/`)**: operator control-plane over Telegram (human-in-the-loop commands and status).

The design intentionally avoids using OpenClaw for market execution logic.

## Safety-First Invariants

Trading is only valid when all conditions are true:

- `DRY_RUN=false`
- `KILL_SWITCH=false`
- `ARMED=true` (persisted and set via explicit ops command)

Default startup state is deliberately safe:

- `DRY_RUN=true`
- `KILL_SWITCH=true`
- `ARMED=false`

Additional enforced guardrail posture:

- Secret redaction in structured logs.
- Token auth on all ops endpoints.
- SQLite WAL mode enabled.
- Config writes restricted to an allowlist.

## Architecture (Phase 0/1)

```text
Telegram User
    |
    v
OpenClaw (skills/plugin)
    |
    | HTTP + x-vanguard-token
    v
Engine Ops API (Express, :3077)
    |
    v
SQLite (better-sqlite3, WAL)
```

## Repository Layout

```text
vanguard-poly/
  apps/
    engine/                   # deterministic engine scaffold
    dashboard/                # reserved for optional Phase 5 UI
  openclaw/
    openclaw.json.example     # hardened Telegram/OpenClaw example config
    skills/vanguard-poly/     # safe command instructions
    plugins/vanguard-poly/    # minimal command bridge stub
  packages/
    domain/                   # pure domain types/invariants (no I/O)
    adapters/                 # adapter placeholders for Phase 2+
    utils/                    # logger + retry/backoff utility code
  docs/                       # architecture/runbook/threat-model docs
  README.md                   # project overview and operator quickstart
  LOG.md                      # session and architecture log for agents
  TODO.md                     # prioritized implementation backlog
```

## Implemented in Phase 0/1

### Control-plane scaffolding

- `openclaw/openclaw.json.example` with:
  - Telegram `dmPolicy: "pairing"`
  - group allowlist policy
  - mention gating patterns
  - skill env wiring (`VANGUARD_ENGINE_URL`, `VANGUARD_TOKEN`)
- `openclaw/skills/vanguard-poly/SKILL.md`:
  - allowed commands: `status`, `arm`, `disarm`, `kill`, `unkill`, `set`
  - explicit prohibition on shell execution
- `openclaw/plugins/vanguard-poly/src/index.ts`:
  - minimal command handlers calling only Engine `/ops/*`

### Engine scaffold

- Strict env validation with `zod` in `apps/engine/src/config/env.ts`.
- SQLite bootstrap with WAL pragmas in `apps/engine/src/database/db.ts`:
  - `journal_mode = WAL`
  - `busy_timeout = 2000`
  - `synchronous = NORMAL`
- Versioned SQL migrations in `apps/engine/src/database/migrate.ts`.
- Initial schema in `apps/engine/src/database/migrations/001_init.sql`:
  - `engine_state`
  - `trades`
  - `decisions`
- Ops API in `apps/engine/src/ops/server.ts` with token auth.
- Boot lifecycle in `apps/engine/src/main.ts`:
  - load env
  - run migrations
  - initialize safety state
  - start ops server
  - periodic heartbeat (`engine_state.last_tick`)

### Shared utilities

- `packages/utils/src/logger.ts`:
  - JSON logging (`winston`)
  - denylist + regex redaction
  - console + `logs/app.log` dual transport
- `packages/utils/src/backoff.ts` retry helper for upcoming adapter work.
- `packages/domain/src/index.ts` typed risk/safety placeholders.

## Ops API (Current)

All endpoints require header:

```text
x-vanguard-token: <VANGUARD_TOKEN>
```

| Method | Path          | Purpose                                 |
| ------ | ------------- | --------------------------------------- |
| GET    | `/ops/status` | Health, uptime, safety flags, db status |
| POST   | `/ops/arm`    | Set `ARMED=true`                        |
| POST   | `/ops/disarm` | Set `ARMED=false`                       |
| POST   | `/ops/kill`   | Set `KILL_SWITCH=true`                  |
| POST   | `/ops/unkill` | Set `KILL_SWITCH=false`                 |
| POST   | `/ops/config` | Set allowlisted runtime key/value       |

`/ops/config` allowlist:

- `DRY_RUN`
- `MAX_USD_PER_TRADE`
- `MAX_OPEN_POSITIONS`
- `MAX_DAILY_LOSS_USD`
- `MAX_TOTAL_EXPOSURE_USD`
- `MIN_LIQUIDITY_USD`
- `MAX_SLIPPAGE_BPS`
- `CONFIDENCE_MIN`
- `EDGE_MIN_BPS`

## Configuration (Selected)

Required:

- `VANGUARD_TOKEN` (ops API auth)

Safety flags:

- `DRY_RUN` (default `true`)
- `KILL_SWITCH` (default `true`)
- `ARMED` (default `false`)

Runtime:

- `OPS_PORT` (default `3077`)
- `DB_PATH` (default `vanguard.db`)
- `HEARTBEAT_INTERVAL_MS` (default `15000`)
- `DEAD_MAN_SWITCH_URL` (optional placeholder for Phase 4)

Risk caps (present now, full enforcement in later phases):

- `MAX_USD_PER_TRADE`
- `MAX_OPEN_POSITIONS`
- `MAX_DAILY_LOSS_USD`
- `MAX_TOTAL_EXPOSURE_USD`
- `MIN_LIQUIDITY_USD`
- `MAX_SLIPPAGE_BPS`
- `CONFIDENCE_MIN`
- `EDGE_MIN_BPS`

See `.env.example` for full list.

## Local Development

### Prerequisites

- Node.js 22 (`.nvmrc` included)
- npm

### Setup

```bash
nvm install 22
nvm use 22
npm install
cp .env.example .env
```

Set at minimum in `.env`:

- `VANGUARD_TOKEN`
- `TELEGRAM_BOT_TOKEN` (for OpenClaw integration)

### Run Engine

```bash
npm run dev --workspace @vanguard-poly/engine
```

### Validate Quality Gates

```bash
npm run typecheck
npm run test
npm run lint
npm run build
```

## Testing Coverage (Current)

- `apps/engine/src/tests/env.test.ts`
  - fails when `VANGUARD_TOKEN` missing
  - verifies safe defaults for critical flags
- `apps/engine/src/tests/db.test.ts`
  - verifies WAL + pragma settings
- `apps/engine/src/tests/ops-auth.test.ts`
  - validates unauthorized requests are rejected

## Roadmap (High-Level)

- **Phase 2**: LLM provider interface + Gemini/DeepSeek adapters with schema validation.
- **Phase 3**: Polymarket market data + dry-run execution wiring.
- **Phase 4**: strategy loop, fault tolerance, dead-man switch ping.
- **Phase 5**: optional read-only dashboard.
- **Phase 6**: hardened OpenClaw-to-Engine bridge.
- **Phase 7**: full threat-model/runbook production posture.

## Documentation and Handoff

- Root `LOG.md`: session/decision history for agents.
- Root `TODO.md`: prioritized task queue and current phase status.
- `docs/`: architecture, runbook, threat model, and detailed phase notes.
