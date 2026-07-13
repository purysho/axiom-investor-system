# AXIOM architecture

For future developers (human or Claude). The system is a pipeline; each layer
only talks to its neighbors, and the safety-critical direction is one-way:
**AI proposes → deterministic code disposes.** Natural-language output can
never reach a broker.

```
Market Data ─→ Feature/Strategy ─→ AI Copilot ─→ Proposal Schema
                                                      │
                                     Deterministic Validator (risk engine)
                                                      │
                              Execution (preflight → write-ahead → broker)
                                                      │
                                        Audit Log + Reconciliation
```

## Layer map

| Layer | Files | Notes |
|---|---|---|
| Market data | `lib/market-data/` (`types.ts`, `stooq.ts`, `alpaca.ts`, `index.ts`), `lib/server/history.ts` | Provider registry keyed by asset class, tried in priority order with graceful fallback (`resolveHistory`). `fetchDailyHistoryForUser` prefers a signed-in user's OWN connected Alpaca keys (any Alpaca key, read-only) for real IEX bars across **charts, quotes, the ticker, benchmarks, and backtests** — then the deployment `ALPACA_API_KEY_ID` key, then keyless Stooq (delayed EOD). Equities/ETFs go to Alpaca; gold/BTC/FX fall through to Stooq automatically. |
| Feature engineering + strategy | `lib/engine/quotes.ts`, `lib/engine/strategy.ts` | O(n) indicator series with enforced warm-up (`WARMUP_BARS`). The entry rules live in `strategy.ts` ONCE — the Copilot proposes from it, the backtester replays it, the bot trades it. |
| AI Copilot | `app/api/copilot/route.ts` | Claude when `ANTHROPIC_API_KEY` is set, deterministic rules otherwise. Either way the output is a **raw candidate**, not an order. |
| Proposal schema | `lib/copilot/types.ts` (`Recommendation`) | Symbol, asset class, timeframe, entry/stop/targets, evidence, invalidation, confidence, data + expiry timestamps. |
| Risk validation | `lib/copilot/validate.ts` (`validateRecommendation`, `VALIDATOR_LIMITS`) | Rejects: expired, no evidence, confidence out of bounds, stale data, disallowed asset class, bad stops, reward:risk under floor, gate closed, behavioural locks, kill switch, heat cap, concurrency, and any proposal carrying an execution key. Recomputes size — model numbers are advisory. |
| Sizing | `lib/engine/sizing.ts` | Risk-first: `floor(risk$ / per-share risk)`, then notional cap. |
| Gate + protections | `lib/engine/gate.ts`, `lib/engine/protections.ts` | Six-check market gate (unknown = fail). Behavioural locks: reflections owed, cooldown, revenge, stop-out streak, drawdown, per-symbol, daily loss limit. |
| Execution | `lib/broker/preflight.ts`, `lib/server/execute-order.ts`, `lib/broker/alpaca.ts`, `lib/broker/sim.ts` | Preflight re-checks against LIVE broker state; write-ahead row before submit; idempotent client order ids; GTC brackets so stops survive overnight. Live mode is double-locked (`ALLOW_LIVE_TRADING` + typed confirmation) and the bot refuses it entirely. `SimBroker` is the keyless built-in paper broker: fills at last close ± the backtester's 5 bps slippage, positions in `sim_positions`, stop/target enforced against each new daily bar. |
| Reconciliation | `app/api/broker/sync/route.ts`, `lib/broker/close-detect.ts`, `lib/server/positions-sync.ts` | Broker is truth for fills; `broker_orders` is truth for intent. Bracket exits close journal trades with the real fill. |
| Bot (paper autopilot) | `lib/server/bot.ts`, `app/api/bot/*`, `app/bot/page.tsx`, `BOT.md` | Walks every interlock in order, logs every run. Paper-only in code. Cron via `BOT_CRON_TOKEN`. |
| Backtesting | `lib/engine/backtest.ts`, `app/api/backtest/route.ts` | Replays the SAME strategy code. Conservative fills: next-open entry, stop-first on ambiguous bars, gaps at the open, slippage both ways. |
| Analytics | `lib/engine/stats.ts`, `lib/engine/benchmarks.ts` | Journal expectancy/adherence/leaks; portfolio sleeves/HHI/unrealized; cross-asset benchmark windows. |
| Audit | `lib/server/audit.ts` | Append-only trail: auth, broker, orders, bot runs. |
| State | `lib/store.ts` (client), `lib/server/db.ts` + `app/api/state` (server) | Local-first with optimistic-concurrency sync; server-side writes (bot fills, position closes) win by timestamp. |

## Security posture

- **CSP is fully first-party**: no external origin appears in the policy.
  Fonts are self-hosted (`app/fonts.css` + `public/fonts`); `'unsafe-eval'`
  is emitted in development only (webpack HMR). See `next.config.mjs`.
- **Sessions**: JWT cookie (SameSite=Lax) + middleware origin check on
  state-changing API calls; `token_version` invalidates all sessions on
  passphrase change.
- **Rate limits** (`lib/server/ratelimit.ts`): login/join/reset/MFA by IP;
  every passphrase-verifying endpoint (password change, account delete, MFA
  disable) by user — a hijacked session cannot brute-force the passphrase;
  `bot/tick` failed auth by IP; data proxies capped to protect the free feed.
- **Broker keys** are verified against the broker before being stored,
  encrypted at rest, and never returned to the browser.
- **Audit log** (`lib/server/audit.ts`): append-only — auth events,
  passphrase changes, MFA changes, broker connects, orders, bot runs.
- **Public routes** are an explicit allowlist in `middleware.ts`
  (login/join/reset/terms/privacy/help + static assets); everything else
  requires a session or offline mode.

## Invariants — do not relax these

1. **LLMs never touch orders.** Proposals carrying execution-ish keys are rejected by the validator; execution lives behind its own authenticated, preflight-gated path.
2. **The bot trades paper only.** `lib/server/bot.ts` checks `conn.mode === "paper"` — a code invariant, not a flag. The built-in `SimBroker` is paper by construction (`mode` is the literal `"paper"`).
3. **Backtest what you trade.** Entry rules exist once, in `lib/engine/strategy.ts`.
4. **Fail closed.** No synced state → no orders. Unknown gate inputs → count as fails. Ambiguous order lookups → propagate, never assume "missing".
5. **Idempotency everywhere an order can happen.** Client order ids are deterministic; duplicate submits return the original.

## Development

```bash
npm run dev        # local app
npm run typecheck  # tsc --noEmit
npm test           # vitest (tests/)
npm run build      # production build
npm run e2e        # e2e/smoke.mjs — signed-in journey against a RUNNING server
```

CI (`.github/workflows/ci.yml`) runs typecheck, tests, and build on every push
to main and every PR.

The e2e smoke test needs a live server on a fresh database (see the header of
`e2e/smoke.mjs` for the two-command setup). It walks the real new-user journey:
join with the bootstrap invite → sync a baseline state → connect the built-in
simulator → dry-run the bot → verify status, run history, and the order log.
It is deliberately not in CI — it wants a live server and outbound market data.
