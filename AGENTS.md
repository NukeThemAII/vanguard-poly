# AGENTS.md

> **SYSTEM OVERRIDE: INSTITUTIONAL MODE**
> **ROLE:** Senior Quant Engineer & Systems Architect
> **OBJECTIVE:** Build **VANGUARD-POLY** — a **low-latency, LLM-assisted** trading engine for **Polymarket CLOB** with an **OpenClaw control-plane** (Telegram-first).
> **MINDSET:** Security is paramount. Latency is money. Code must be modular, typed, testable, and production-ready.

---

## 0. REALITY CHECK (READ THIS FIRST)

**OpenClaw is the control-plane, not the matching engine.**

* OpenClaw excels at: channels (Telegram), approvals, scheduling, tool orchestration, and ops UX.
* The **trading loop** must live in a **dedicated Engine process** (deterministic, minimal dependencies). OpenClaw sends commands + receives telemetry.

**Design goal:**

* **Engine** = makes decisions + executes trades (fast path).
* **OpenClaw** = human-in-the-loop control + alerts + config updates + “kill switch” over Telegram.

---

## 1. NON-NEGOTIABLES (GUARDRAILS)

### 1.1 Secrets & Key Hygiene 🔐

* **Never** log secrets: private keys, API keys, auth headers, cookies, JWTs.
* Use a **redacting logger** (denylist fields + regex).
* `.env` is local dev only; ship `.env.example` and **no secrets in git**.
* Use a **dedicated hot wallet** with minimal funds; withdraw regularly.

### 1.2 “Armed” Trading State (2-key safety) 🧨

Trading can only occur when **ALL** are true:

* `DRY_RUN=false`
* `KILL_SWITCH=false`
* `ARMED=true` **(persisted state + explicit telegram command)**

Default state must be **DRY_RUN=true**, **KILL_SWITCH=true**, **ARMED=false**.

### 1.3 Reliability & Idempotency 🧱

* Bot must not crash on single provider failure.
* All network calls: **timeouts + retry(backoff+jitter) + circuit breaker**.
* Execution must be **idempotent**:

  * On retries, do not double-place orders.
  * Record an **execution intent id** before attempting placement.

### 1.4 Trading Risk Controls (Hard Limits) 📉

Config hard caps (enforced in code, not prompts):

* `MAX_USD_PER_TRADE`
* `MAX_OPEN_POSITIONS`
* `MAX_DAILY_LOSS_USD`
* `MAX_TOTAL_EXPOSURE_USD`
* `MIN_LIQUIDITY_USD` (default 10_000)
* `MAX_SLIPPAGE_BPS` (default 50)
* `CONFIDENCE_MIN` (default 0.85)
* `EDGE_MIN_BPS` (default 100)

If any limit fails → **no trade** + log + Telegram alert.

### 1.5 ClawHub / Skill Supply-Chain Policy ⚠️

* Treat every 3rd-party skill/plugin as **arbitrary code execution**.
* **No blind installs.** Anything from ClawHub must be:

  1. code reviewed
  2. vendored (pinned commit/tag)
  3. run under sandboxing where feasible

---

## 2. PROJECT MANIFEST

**Project Name:** `vanguard-poly`

**Description:**
A Polymarket CLOB trading system that:

* ingests market data + news signals
* uses an LLM (Gemini/DeepSeek) for structured analysis
* executes with strict risk controls
* exposes telemetry + controls to OpenClaw via Telegram

### 2.1 Tech Stack

* **Engine Runtime:** Node.js (v20+), TypeScript (strict)
* **DB:** SQLite via `better-sqlite3` (WAL enabled)
* **LLM Providers:**

  * Dev: Gemini (Google AI Studio)
  * Prod: DeepSeek (OpenAI-compatible)
* **Polymarket:** CLOB + Gamma markets data
* **Ops Control Plane:** OpenClaw Gateway + Telegram (grammY)
* **Testing:** Vitest (unit/integration), Nock/MSW for HTTP
* **Quality:** ESLint + Prettier + Husky + CI

---

## 3. REPO LAYOUT

```
/vanguard-poly
  /apps
    /engine                 # Deterministic trading engine (fast path)
    /dashboard              # Optional lightweight dashboard (read-only)
  /openclaw
    /skills/vanguard-poly   # OpenClaw skill bundle (Telegram commands + tool wrappers)
    openclaw.json.example   # Minimal hardened config example
  /packages
    /domain                 # Pure domain types + invariants (NO I/O)
    /adapters               # External boundaries (Polymarket, LLM, news)
    /utils                  # logging, backoff, queues
  /docs
    TODO.md
    LOG.md
    ARCHITECTURE.md
    THREAT_MODEL.md
    RUNBOOK.md
  docker-compose.yml
  .env.example
  package.json
  tsconfig.json
```

**Rule:** `/packages/domain` contains **no** HTTP, DB, filesystem, process.env.

---

## 4. OPENCLAW INTEGRATION (TELEGRAM-FIRST)

### 4.1 OpenClaw Setup (Operator Path)

* Install OpenClaw and run the onboarding wizard.
* Use Telegram channel first (direct chat), then optionally a locked-down group.

### 4.2 Hardened OpenClaw Defaults

* Telegram `dmPolicy = "pairing"`
* Group policy: allowlist + mention-gated
* Prefer running tools under sandboxing
* Disable/avoid host command execution unless absolutely needed

### 4.3 Minimal `openclaw.json` Example (put in `/openclaw/openclaw.json.example`)

```json
{
  "channels": {
    "telegram": {
      "botToken": "${TELEGRAM_BOT_TOKEN}",
      "dmPolicy": "pairing",
      "allowFrom": [],
      "groupPolicy": "allowlist",
      "groupAllowFrom": [],
      "linkPreview": false,
      "mediaMaxMb": 10
    }
  },
  "agents": {
    "defaults": {
      "sandbox": {
        "enabled": true
      }
    },
    "list": [
      {
        "id": "main",
        "name": "vanguard-poly-ops",
        "groupChat": {
          "requireMention": true,
          "mentionPatterns": ["\\b@vanguard\\b", "\\b/vanguard\\b"]
        }
      }
    ]
  },
  "skills": {
    "entries": {
      "vanguard-poly": {
        "enabled": true,
        "env": {
          "VANGUARD_ENGINE_URL": "http://127.0.0.1:3077",
          "VANGUARD_TOKEN": "${VANGUARD_TOKEN}"
        }
      }
    }
  }
}
```

### 4.4 Control Commands (Telegram)

The OpenClaw skill must implement **human-safe** ops verbs:

* `status` → engine health, uptime, balances, open positions, ARMED/KILL_SWITCH
* `arm` / `disarm`
* `kill` / `unkill`
* `set <param> <value>` (only allowlisted params)
* `dryrun on|off`
* `last` → last decision + rationale hash

**No command should ever accept raw shell commands.**

---

## 5. ENGINE ARCHITECTURE (FAST PATH)

### 5.1 Key Design Rules

* **Execution is deterministic** and does not depend on LLM availability.
* LLM provides **structured analysis** + probability estimate; Engine decides.
* Never leave resting orders unless explicitly enabled; default to **IOC/FOK behavior**.

### 5.2 Data Model (Auditable)

Every decision persisted with:

* market snapshot hash
* news ids / rss items
* LLM output (validated) + model/provider metadata
* risk evaluation (limits + computed metrics)
* execution intent id
* resulting fills / partial fills / cancels

### 5.3 SQLite Concurrency

* Enable WAL mode.
* Keep DB writes small and predictable.
* If contention is observed, move heavy reads to a replica or separate process.

---

## 6. EXECUTION PHASES (BUILD PLAN)

### PHASE 0: OPERATOR CONTROL-PLANE (OpenClaw)

**Goal:** A secured Telegram control surface before trading exists.

* Create `/openclaw/openclaw.json.example`
* Create `/openclaw/skills/vanguard-poly/SKILL.md` with tool instructions
* Add “pairing required” + mention gating guidance to `/docs/RUNBOOK.md`

**DoD:**

* Telegram DM pairing works; unknown DMs get blocked.
* `status` command returns a stub response.

---

### PHASE 1: ENGINE SCAFFOLD + HYGIENE

**Goal:** Strict TS, logging, config validation, DB bootstrap.

1. Dependencies:

   * runtime: `axios`, `zod`, `dotenv`, `winston`, `better-sqlite3`
   * dev: `typescript`, `tsx`, `vitest`, `eslint`, `prettier`, `husky`, `lint-staged`
2. `packages/utils/logger.ts`:

   * JSON logs, redact secrets
   * dual stream: console + `logs/app.log`
3. `apps/engine/src/config/env.ts` (zod):

   * LLM keys, Polymarket keys, private key
   * risk caps, feature flags (DRY_RUN, KILL_SWITCH, ARMED)
4. `apps/engine/src/database/db.ts`:

   * WAL mode
   * migrations

**DoD:**

* `npm run typecheck`, `npm test`, `npm run lint` pass.
* Engine boots, validates env, creates DB, logs a startup line.

---

### PHASE 2: LLM ADAPTERS (BRAIN)

**Goal:** Provider-agnostic, schema-only outputs, rate limiting.

* `ILLMProvider` interface
* Gemini adapter (queue spacing for free tier limits)
* DeepSeek adapter (OpenAI-compatible baseURL)
* zod schema for analysis output:

  * `sentiment` (-1..+1)
  * `confidence` (0..1)
  * `fairProbability` (0..1)
  * `rationale` (short)

**DoD:**

* Unit tests: malformed JSON rejected.
* Rate-limited queue prevents bursts.

---

### PHASE 3: POLYMARKET HANDS (MARKET + WALLET)

**Goal:** Market fetch + order placement behind DRY_RUN.

* Market data:

  * Trending/high-volume markets
  * Orderbook snapshot + spread + liquidity
* Execution:

  * place order with **IOC/FOK semantics** (no resting orders by default)
  * cancel-on-timeout
* Wallet:

  * never log keys

**DoD:**

* End-to-end simulated trade (dry-run) with risk checks.

---

### PHASE 4: STRATEGY LOOP (BRAIN ↔ HANDS)

**Goal:** Orchestrate signals → decision → risk → execution → persistence.

* Scheduler tick
* Kill switch + armed gating
* Dead man’s switch ping (external healthcheck URL)

**DoD:**

* Full loop runs without crashing under induced provider failures.

---

### PHASE 5: DASHBOARD (OPTIONAL)

**Goal:** Minimal read-only status dashboard (local).

* `/api/status`, `/api/logs`
* Token auth

**DoD:**

* Dashboard shows engine state; no trading controls here (Telegram only).

---

### PHASE 6: OPENCLAW ↔ ENGINE BRIDGE

**Goal:** OpenClaw skill talks to engine over localhost HTTP.

* Engine exposes:

  * `GET /ops/status`
  * `POST /ops/arm`
  * `POST /ops/disarm`
  * `POST /ops/kill`
  * `POST /ops/unkill`
  * `POST /ops/config` (allowlisted params)

**DoD:**

* Telegram commands trigger engine state changes and return confirmations.

---

### PHASE 7: HARDENING + RUNBOOK

**Goal:** Production posture.

* `docs/THREAT_MODEL.md` complete
* `docs/RUNBOOK.md` includes:

  * incident response
  * key rotation
  * safe upgrade procedure
  * backup/restore
  * verification steps

**DoD:**

* Runbook can be executed by a third party and result is deterministic.

---

## 7. DOCUMENTATION STANDARDS

### 7.1 `docs/LOG.md` Entry Template

```md
## [YYYY-MM-DD HH:MM] - Architecture Decision
- **Context:**
- **Decision:**
- **Alternatives Considered:**
- **Impact:**
- **Follow-ups:**
```

### 7.2 `docs/TODO.md`

* Must reflect current phase and next tasks.
* Every completed task gets checked.

---

## 8. START COMMAND (FOR CODEX)

> **Agent, initialize the repository for VANGUARD-POLY using this AGENTS.md.**
>
> 1. Create the repo layout as specified.
> 2. Add strict TS + lint/test tooling.
> 3. Create the OpenClaw skill stub and `openclaw.json.example` with Telegram pairing defaults.
> 4. Bootstrap the Engine with env validation, logger, and WAL-enabled SQLite.
> 5. Update `docs/TODO.md` and `docs/LOG.md` with what you did.
