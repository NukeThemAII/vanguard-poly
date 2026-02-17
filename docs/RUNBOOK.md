# RUNBOOK (Stub)

## Telegram Control-Plane Safety

- Pairing is required for direct messages (`dmPolicy=pairing`).
- Unknown DMs must remain blocked until explicit operator pairing.
- Group chats must be allowlisted and mention-gated.
- Use dedicated bot identity for operations only.

## Safe Startup

1. Ensure `.env` values keep defaults: `DRY_RUN=true`, `KILL_SWITCH=true`, `ARMED=false`.
2. Set `VANGUARD_TOKEN` and `TELEGRAM_BOT_TOKEN`.
3. Start Engine and verify `/ops/status` succeeds with token auth.
4. Start OpenClaw with `openclaw/openclaw.json.example` copied to active config.
5. Confirm Telegram `/status` command reports safe state.

## Safe State Changes

- `arm` only after human approval and checklist completion.
- `kill` should be immediate and reversible only by authorized operator.
- `set` must only modify allowlisted parameters.
- Never pass shell commands through Telegram controls.

## Incident Placeholder

- If suspicious command activity is observed: set `KILL_SWITCH=true`, rotate `VANGUARD_TOKEN`, review logs, and re-pair operators.
