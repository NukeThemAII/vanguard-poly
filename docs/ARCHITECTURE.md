# Architecture (Phase 0/1 Baseline)

## Components

- `apps/engine`: deterministic control-plane engine process (no live trading yet).
- `openclaw/skills/vanguard-poly`: Telegram-first operations skill instructions.
- `openclaw/plugins/vanguard-poly`: plugin stub mapping Telegram commands to Engine `/ops/*`.
- `packages/domain`: pure domain types/invariants placeholders.
- `packages/utils`: shared logger and retry/backoff helpers.

## Control Plane

- OpenClaw receives Telegram commands.
- OpenClaw skill/plugin calls Engine HTTP ops endpoints on localhost.
- Engine enforces token auth, applies `helmet` headers, and persists control-state in SQLite.
- Engine binds by `OPS_HOST` (default `127.0.0.1`).

## Safety Defaults

- `DRY_RUN=true`
- `KILL_SWITCH=true`
- `ARMED=false`

## Persistence

- SQLite with WAL mode and migration tracking table.
- Audit-oriented tables for `decisions`, `trades`, and `engine_state`.
