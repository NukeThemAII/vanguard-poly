# RUNBOOK (Stub)

## Telegram Control-Plane Safety

- Pairing is required for direct messages (`dmPolicy=pairing`).
- Unknown DMs must remain blocked until explicit operator pairing.
- Group chats must be allowlisted and mention-gated.
- Use dedicated bot identity for operations only.

## Safe Startup

1. Ensure `.env` values keep defaults: `DRY_RUN=true`, `KILL_SWITCH=true`, `ARMED=false`.
2. Set `VANGUARD_TOKEN` and `TELEGRAM_BOT_TOKEN`.
3. Keep `OPS_HOST=127.0.0.1` for host-local deployments.
4. If running in Docker with published port, override `OPS_HOST=0.0.0.0`.
5. Start Engine and verify `/ops/status` succeeds with token auth.
6. Start OpenClaw with `openclaw/openclaw.json.example` copied to active config.
7. Confirm Telegram `/status` command reports safe state.
8. Optionally call `/ops/simulate-trade` to verify dry-run pipeline health.

Example:

```bash
curl -s -X POST http://127.0.0.1:3077/ops/simulate-trade \
  -H "content-type: application/json" \
  -H "x-vanguard-token: ${VANGUARD_TOKEN}" \
  -d '{"side":"BUY","sizeUsd":50,"confidence":0.9,"edgeBps":120,"timeInForce":"IOC"}'
```

## Safe State Changes

- `arm` only after human approval and checklist completion.
- `kill` should be immediate and reversible only by authorized operator.
- `set` must only modify allowlisted parameters.
- Never pass shell commands through Telegram controls.
- Confirm ops responses include expected security headers from `helmet`.
- Use `simulate-trade` only for DRY_RUN verification; it is not live execution.

## Incident Placeholder

- If suspicious command activity is observed: set `KILL_SWITCH=true`, rotate `VANGUARD_TOKEN`, review logs, and re-pair operators.
