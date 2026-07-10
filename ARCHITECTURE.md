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
| Market data | `lib/market-data/` (`types.ts`, `stooq.ts`, `index.ts`), `lib/server/history.ts` | Provider registry keyed by asset class. Default: Stooq, keyless, delayed EOD. TODOs mark where keyed providers (Alpaca data, Alpha Vantage) slot in. |
| Feature engineering + strategy | `lib/engine/quotes.ts`, `lib/engine/strategy.ts` | O(n) indicator series with enforced warm-up (`WARMUP_BARS`). The entry rules live in `strategy.ts` ONCE — the Copilot proposes from it, the backtester replays it, the bot trades it. |
| AI Copilot | `app/api/copilot/route.ts` | Claude when `ANTHROPIC_API_KEY` is set, deterministic rules otherwise. Either way the output is a **raw candidate**, not an order. |
| Proposal schema | `lib/copilot/types.ts` (`Recommendation`) | Symbol, asset class, timeframe, entry/stop/targets, evidence, invalidation, confidence, data + expiry timestamps. |
| Risk validation | `lib/copilot/validate.ts` (`validateRecommendation`, `VALIDATOR_LIMITS`) | Rejects: expired, no evidence, confidence out of bounds, stale data, disallowed asset class, bad stops, reward:risk under floor, gate closed, behavioural locks, kill switch, heat cap, concurrency, and any proposal carrying an execution key. Recomputes size — model numbers are advisory. |
| Sizing | `lib/engine/sizing.ts` | Risk-first: `floor(risk$ / per-share risk)`, then notional cap. |
| Gate + protections | `lib/engine/gate.ts`, `lib/engine/protections.ts` | Six-check market gate (unknown = fail). Behavioural locks: reflections owed, cooldown, revenge, stop-out streak, drawdown, per-symbol, daily loss limit. |
| Execution | `lib/broker/preflight.ts`, `lib/server/execute-order.ts`, `lib/broker/alpaca.ts` | Preflight re-checks against LIVE broker state; write-ahead row before submit; idempotent client order ids; GTC brackets so stops survive overnight. Live mode is double-locked (`ALLOW_LIVE_TRADING` + typed confirmation) and the bot refuses it entirely. |
| Reconciliation | `app/api/broker/sync/route.ts`, `lib/broker/close-detect.ts`, `lib/server/positions-sync.ts` | Broker is truth for fills; `broker_orders` is truth for intent. Bracket exits close journal trades with the real fill. |
| Bot (paper autopilot) | `lib/server/bot.ts`, `app/api/bot/*`, `app/bot/page.tsx`, `BOT.md` | Walks every interlock in order, logs every run. Paper-only in code. Cron via `BOT_CRON_TOKEN`. |
| Backtesting | `lib/engine/backtest.ts`, `app/api/backtest/route.ts` | Replays the SAME strategy code. Conservative fills: next-open entry, stop-first on ambiguous bars, gaps at the open, slippage both ways. |
| Analytics | `lib/engine/stats.ts`, `lib/engine/benchmarks.ts` | Journal expectancy/adherence/leaks; portfolio sleeves/HHI/unrealized; cross-asset benchmark windows. |
| Audit | `lib/server/audit.ts` | Append-only trail: auth, broker, orders, bot runs. |
| State | `lib/store.ts` (client), `lib/server/db.ts` + `app/api/state` (server) | Local-first with optimistic-concurrency sync; server-side writes (bot fills, position closes) win by timestamp. |

## Invariants — do not relax these

1. **LLMs never touch orders.** Proposals carrying execution-ish keys are rejected by the validator; execution lives behind its own authenticated, preflight-gated path.
2. **The bot trades paper only.** `lib/server/bot.ts` checks `conn.mode === "paper"` — a code invariant, not a flag.
3. **Backtest what you trade.** Entry rules exist once, in `lib/engine/strategy.ts`.
4. **Fail closed.** No synced state → no orders. Unknown gate inputs → count as fails. Ambiguous order lookups → propagate, never assume "missing".
5. **Idempotency everywhere an order can happen.** Client order ids are deterministic; duplicate submits return the original.

## Development

```bash
npm run dev        # local app
npm run typecheck  # tsc --noEmit
npm test           # vitest (tests/)
npm run build      # production build
```

CI (`.github/workflows/ci.yml`) runs all three on every push to main and every PR.
