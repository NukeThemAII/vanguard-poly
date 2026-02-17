# THREAT MODEL (Stub)

## Scope

- Engine process (`apps/engine`) running deterministic ops endpoints.
- OpenClaw control-plane (`openclaw/`) receiving Telegram commands.
- Local SQLite state and log files.

## Critical Assets

- `VANGUARD_TOKEN` and future wallet/API credentials.
- Engine state flags: `DRY_RUN`, `KILL_SWITCH`, `ARMED`.
- Decision/execution audit data in SQLite.

## Initial Threats

- Unauthorized ops endpoint calls.
- Secret leakage through logs.
- Unsafe config mutation through unallowlisted params.
- Misconfiguration that enables trading unexpectedly.
- Plugin/skill supply-chain risk from third-party code.

## Initial Mitigations

- Mandatory `x-vanguard-token` auth for all `/ops/*` endpoints.
- Redacting logger denylist + regex scrub.
- Safe defaults: `DRY_RUN=true`, `KILL_SWITCH=true`, `ARMED=false`.
- Config allowlist on `/ops/config`.
- No shell command execution from OpenClaw skill/plugin stubs.

## Open Items

- Add per-endpoint rate limiting and request audit IDs.
- Add HMAC or mTLS between OpenClaw and Engine.
- Formal incident severity matrix and playbooks.
