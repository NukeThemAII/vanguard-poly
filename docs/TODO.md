# VANGUARD-POLY TODO

Source of truth: root `TODO.md`. This file is a phase-oriented mirror for AGENTS.md continuity.

## Current Focus

- [x] Phase 0: Operator control-plane scaffold (OpenClaw + Telegram-safe defaults)
- [x] Phase 1: Engine scaffold + hygiene baseline
- [x] Phase 2: LLM adapters (provider-agnostic + schema-only output)
- [ ] Phase 3: Polymarket market/wallet adapters under DRY_RUN
- [ ] Phase 4: Strategy loop + resiliency drills
- [ ] Phase 5: Optional read-only dashboard
- [ ] Phase 6: OpenClaw to Engine bridge hardening
- [ ] Phase 7: Production hardening + deterministic runbook

## Phase 0 DoD

- [x] `openclaw/openclaw.json.example` created with `dmPolicy=pairing`
- [x] Telegram group policy stubs include allowlist + mention gating
- [x] `openclaw/skills/vanguard-poly/SKILL.md` created with safe ops-only commands
- [x] `docs/RUNBOOK.md` includes pairing and mention-gating guidance
- [x] `status` behavior documented and implemented as a stub endpoint via Engine ops

## Phase 1 DoD

- [x] Strict TypeScript workspace baseline created
- [x] Redacting JSON logger scaffolded with dual stream output
- [x] Engine env validation implemented with zod and safe defaults
- [x] SQLite bootstrap uses WAL + tuned pragmas
- [x] Ops API applies `helmet` security headers
- [x] Ops server host binding configurable via `OPS_HOST` (default loopback)
- [x] Migration runner and initial schema created
- [x] Engine boot path: validate env, migrate DB, start ops server, heartbeat
- [x] Quality gates pass (`typecheck`, `test`, `lint`)

## Next Up (Phase 2)

- [x] Define `ILLMProvider` interface in `packages/adapters`
- [x] Add Gemini adapter with queue spacing
- [x] Add DeepSeek adapter (OpenAI-compatible)
- [x] Add schema validation tests for malformed model output

## Next Up (Phase 3)

- [ ] Implement market data adapters (trending/high-volume + orderbook snapshot)
- [ ] Add DRY_RUN order execution pathway with IOC/FOK semantics
- [ ] Implement risk gate evaluation before execution attempt
- [ ] Persist execution intent IDs before placement attempts
