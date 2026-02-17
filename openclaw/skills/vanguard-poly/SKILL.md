---
name: vanguard-poly
description: Safe Telegram operations skill for VANGUARD-POLY engine control-plane.
---

# VANGUARD-POLY OpenClaw Skill

## Scope

- This skill is for operations control only.
- Call Engine HTTP ops endpoints on `VANGUARD_ENGINE_URL`.
- Authenticate every call with header `x-vanguard-token: ${VANGUARD_TOKEN}`.

## Allowed Commands

- `status` -> `GET /ops/status`
- `arm` -> `POST /ops/arm`
- `disarm` -> `POST /ops/disarm`
- `kill` -> `POST /ops/kill`
- `unkill` -> `POST /ops/unkill`
- `set <key> <value>` -> `POST /ops/config` with JSON payload `{ "key": "...", "value": ... }`

## Safety Rules

- Never execute shell commands.
- Never proxy user input to host command execution.
- Only send requests to Engine `/ops/*` endpoints.
- Reject unknown config keys; allowlist only.
- If auth fails, return a security warning and do not retry with modified tokens.
- Never print tokens, secrets, or private keys.

## Expected Responses

- Return concise status including uptime, `DRY_RUN`, `KILL_SWITCH`, `ARMED`, and db health.
- On mutation commands, echo confirmed engine response.
- On errors, include endpoint + status code, without exposing secrets.
