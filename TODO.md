# TODO

Cross-session priority queue for VANGUARD-POLY.

## Phase Status

- [x] Phase 0: OpenClaw Telegram-first control-plane scaffold
- [x] Phase 1: Engine scaffold + hygiene baseline
- [x] Phase 2: LLM adapters (Gemini + DeepSeek, schema-only outputs)
- [x] Phase 3: Polymarket adapters (market + execution under DRY_RUN)
- [ ] Phase 4: Strategy loop and resilience hardening
- [ ] Phase 5: Optional read-only dashboard
- [ ] Phase 6: OpenClaw <-> Engine bridge hardening
- [ ] Phase 7: Threat model and runbook productionization

## Immediate Priorities (Next 1-2 Sessions)

- [x] Define `ILLMProvider` interface in `packages/adapters`.
- [x] Add shared zod schema for LLM analysis payload:
  - `sentiment` in `[-1, 1]`
  - `confidence` in `[0, 1]`
  - `fairProbability` in `[0, 1]`
  - `rationale` short text
- [x] Implement Gemini adapter with queue spacing/rate limiting.
- [x] Implement DeepSeek adapter (OpenAI-compatible base URL).
- [x] Add malformed JSON rejection tests for LLM outputs.
- [x] Implement Polymarket market provider (trending + orderbook snapshot + liquidity/spread).
- [x] Add DRY_RUN IOC/FOK execution path with hard risk gates.
- [x] Persist execution intents before placement attempts.
- [x] Add `/ops/simulate-trade` endpoint for authenticated dry-run execution checks.
- [ ] Wire LLM analysis output into strategy-driven trade candidate selection.

## Engine Hardening Backlog

- [x] Add risk-evaluation module that enforces caps before execution.
- [x] Add idempotent execution intent persistence before place-order attempts.
- [x] Add timeout/retry/backoff/circuit-breaker to market data network calls.
- [ ] Add dead-man switch ping worker using `DEAD_MAN_SWITCH_URL`.
- [ ] Add structured request IDs and audit fields to ops endpoint logs.
- [ ] Add rate limiting for `/ops/*` endpoints.
- [x] Add API hardening middleware (`helmet`) on `/ops/*`.
- [x] Bind ops server to configurable host (`OPS_HOST`), default loopback-only.

## OpenClaw Control-Plane Backlog

- [ ] Wire plugin to real OpenClaw plugin types when available.
- [ ] Implement `/set` key validation UX feedback with clear allowlist descriptions.
- [ ] Add `/last` command (decision + rationale hash) once decision pipeline exists.
- [ ] Add `/dryrun on|off` command as explicit convenience wrapper.
- [ ] Add Telegram operator identity allowlist checks in runtime config.

## Data and Persistence Backlog

- [ ] Extend migrations for:
  - provider call audit table
  - execution intents table
  - positions and PnL snapshots
- [ ] Add migration checksum support to detect modified SQL files.
- [ ] Add DB backup/restore scripts for ops runbook.

## Testing Backlog

- [ ] Integration test for full engine boot and `/ops/status` shape.
- [ ] Integration test for `/ops/config` allowlist rejects unknown keys.
- [ ] Property tests for env coercion edge cases.
- [ ] Failure injection tests for provider timeout and retry behavior.
- [ ] Adapter integration tests for API timeout/429 and retry behavior.

## Ops / DevEx Backlog

- [ ] Add CI workflow (`typecheck`, `test`, `lint`, `build`) on PRs.
- [ ] Pin Node toolchain in CI to 22.x.
- [ ] Add Makefile shortcuts for common operator workflows.
- [ ] Add production `.env` validation docs for VPS deployment.

## Handoff Checklist (Per Session)

- [ ] Update root `LOG.md` with timestamped changes.
- [ ] Update root `TODO.md` statuses and next priorities.
- [ ] Mirror major updates into `docs/LOG.md` and `docs/TODO.md` as needed.
- [ ] Record exact validation commands executed and their result.

## Source-of-Truth Note

- Root `TODO.md` is the primary backlog.
- `docs/TODO.md` is kept as a synced phase mirror for AGENTS.md workflow.
