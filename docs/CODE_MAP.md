# AXIOM code map

A fast index for locating code. One line per file: `path` — role (key exports).
Grep this file, jump to the path. The visual twin is
[`docs/axiom-code-atlas.canvas`](./axiom-code-atlas.canvas); the higher-level
mind map is [`docs/axiom-architecture.canvas`](./axiom-architecture.canvas).

**Pipeline (safety-critical, one-way):** Market data → indicators → strategy →
(Copilot proposes | Bot scans) → deterministic validator/sizing/gate → execution
(preflight → write-ahead → broker) → reconciliation → audit + synced state.

---

## Strategy & math engine — `lib/engine/`
- `lib/engine/strategy.ts` — **the ONE source of entry rules.** `signalAt`, `latestSignal`, `computeIndicators`, `FIRST_TRADABLE_BAR`. Trend-pullback + mean-reversion; optional same-bar `{ confirm }`. Copilot, bot, and backtest all call this.
- `lib/engine/quotes.ts` — indicator math + Stooq CSV parse. `sma/ema/rsi/rsiArray/macd/bollingerBands`, `computeWatchMetrics`, `mapToStooq`, `parseStooqDaily`, `WARMUP_BARS` (260), `calendarDaysFor`, `DailyRow`.
- `lib/engine/sizing.ts` — **risk-first sizing.** `computeSizing`: `floor(risk$ / perShareRisk)` then single-name notional cap.
- `lib/engine/backtest.ts` — **deterministic backtester.** `runBacktest`, `BacktestParams`, `DEFAULT_BACKTEST_PARAMS`, `BacktestResult`. Next-open fills, stop-first, gaps at open, slippage both ways, heat/concurrency caps, benchmark filter, `perSymbolCooldownBars`, `requireEntryConfirmation`.
- `lib/engine/algo-report.ts` — export for AI **evaluation.** `buildAlgorithmReportMarkdown`, `buildAlgorithmReportJson`, `algorithmSpecMarkdown`, `sampleEquityCurve`. Honest actual-coverage window; refuses to annualize < ~10mo.
- `lib/engine/algo-repro.ts` — export for AI **reproduction.** `buildReproPython`: one self-contained pure-stdlib Python file (embedded OHLC + faithful port). Validated trade-for-trade by `tests/repro.test.ts`.
- `lib/engine/gate.ts` — **six-check risk gate.** `evaluateGate`, `openPlannedRiskUsd`, `gateColorVar`. Unknown inputs count as fails.
- `lib/engine/protections.ts` — **behavioural locks.** `evaluateProtections`, `lockFor`, `DEFAULT_PROTECTIONS`: reflections owed, cooldown, revenge, stop-out streak, drawdown, per-symbol, daily-loss.
- `lib/engine/overview.ts` — `buildOverview`: pure system-status model behind the Today strip (gate, open risk vs heat, locks, kill switch).
- `lib/engine/benchmarks.ts` — cross-asset comparison. `BENCHMARK_SET`, `buildBenchmarkReport`, `returnsOverWindows`, `rebasedTail`.
- `lib/engine/stats.ts` — `journalStats` (expectancy/adherence/leaks), `portfolioStats` (sleeves/HHI/unrealized).
- `lib/engine/action.ts` — `suggestPermittedAction` (daily answer), `checkAlerts` (watch-rule facts).
- `lib/engine/types.ts` — `AppState`, `Trade`, `Holding`, `GateState`, `Sleeve`, and other core domain types.

## Market data — `lib/market-data/` + `lib/server/history.ts`
- `lib/market-data/types.ts` — `MarketDataProvider` interface, `MarketAssetClass`, `classifySymbol`.
- `lib/market-data/alpaca.ts` — **real IEX bars.** `AlpacaDataProvider` (optional per-user creds override), `mapAlpacaBars`, `alpacaDataCreds`, `hasAlpacaDataCreds`. Serves Equity/ETF/Bond.
- `lib/market-data/stooq.ts` — `StooqProvider`: keyless delayed EOD fallback.
- `lib/market-data/index.ts` — registry + `resolveHistory` (priority order, graceful fallback), `getDailyHistory`, `providerFor`, `listProviders`.
- `lib/server/history.ts` — `fetchDailyHistory`, **`fetchDailyHistoryForUser`** (prefers the user's own Alpaca keys), `usesRealData`.

## AI Copilot — `lib/copilot/` + routes
- `app/api/copilot/route.ts` — the scan. Claude when `ANTHROPIC_API_KEY` set, deterministic rules otherwise. Output is a **raw candidate, never an order.**
- `lib/copilot/types.ts` — `Recommendation` schema + `DEFAULT_COPILOT` (kill switch, reflections).
- `lib/copilot/validate.ts` — **the deterministic validator.** `validateRecommendation`, `VALIDATOR_LIMITS`. Rejects expired/no-evidence/bad-R:R/stale/execution-key/etc.; recomputes size.
- `app/copilot/page.tsx` — proposal blotter + cards; human approves each; kill switch.

## AXIOM bot (paper autopilot) — `lib/server/bot.ts` + routes
- `lib/server/bot.ts` — **the runner + 11 interlocks + settings.** `runBotForUser`, `getBotSettings`/`saveBotSettings`, `listBotRuns`, `listEnabledBotUsers`, `BotSettings` (`universe`, `maxOrdersPerRun`, `requireEntryConfirmation`). Paper-only enforced here in code.
- `app/api/bot/route.ts` — GET status, POST settings (enabling requires a paper broker).
- `app/api/bot/run/route.ts` — manual run `{ dryRun? }`.
- `app/api/bot/tick/route.ts` — cron entry; `BOT_CRON_TOKEN` (timing-safe), runs all enabled users.
- `app/bot/page.tsx` — bot UI: universe, dry-run, live account, run history, **order log**, in-app backtest + exports (.md/.json/.py), broad-universe preset, cooldown/confirmation levers.

## Brokers + execution — `lib/broker/` + `lib/server/`
- `lib/broker/types.ts` — provider-agnostic `Broker` interface, `BracketOrderRequest`, `BrokerError`. **Never decides what to trade.**
- `lib/broker/alpaca.ts` — `AlpacaBroker` (paper/live). `getOrderByClientId` only 404→null (others rethrow).
- `lib/broker/sim.ts` — **built-in `SimBroker`** (no keys/KYC). Fills at last close ± backtester's 5bps; `nyseClock`, `checkExitLevel`, `applySlippage`.
- `lib/broker/preflight.ts` — `liveTradingEnabled`, live-state preflight (buying power, restriction, 5%-equity backstop).
- `lib/broker/account-summary.ts` — `summarizeAccount` (equity, unrealized, largest weight).
- `lib/broker/close-detect.ts` — pure `detectClosedTrades` + `applyCloses` (bracket legs → journal closes).
- `lib/server/execute-order.ts` — **the one submit path** (manual + bot). `executeVerifiedOrder`: write-ahead row → idempotent submit → status. GTC brackets.
- `lib/server/broker-store.ts` — `getBroker`, `getConnection`, `saveBrokerKeys`/`clearBrokerKeys`, `connectSim`, `getAlpacaDataCreds`, `ordersToday`.
- `lib/server/positions-sync.ts` — `reconcileClosedPositions` (server wrapper around close-detect).
- `lib/server/backtest-request.ts` — shared `prepareBacktest` (parse→fetch→run) for both backtest routes.

## Broker/analysis API routes — `app/api/`
- `app/api/broker/connect/route.ts` — POST keys or `{ mode:"sim" }`; DELETE forget. Verifies before storing.
- `app/api/broker/status/route.ts` — account + positions + clock snapshot.
- `app/api/broker/order/route.ts` — manual order (validated → `executeVerifiedOrder`).
- `app/api/broker/orders/route.ts` — order log (write-ahead intent record).
- `app/api/broker/positions/route.ts` — cheap read-only positions.
- `app/api/broker/sync/route.ts` — reconcile fills.
- `app/api/backtest/route.ts` — JSON results. `app/api/backtest/repro/route.ts` — reproducible `.py`.
- `app/api/chart/route.ts` — OHLC + indicators (per-user real data). `app/api/quotes/route.ts` — batch close/metrics.
- `app/api/benchmarks/route.ts` — cross-asset. `app/api/market/route.ts` — macro (FRED). `app/api/assistant/route.ts` — Ask AXIOM.

## State, persistence, security — `lib/` + `lib/server/` + config
- `lib/store.ts` — client-first state (`useAppState`, `update`, `replaceState`, keys). `lib/sync.ts` — optimistic-concurrency server sync.
- `lib/server/db.ts` — libSQL/Turso schema + migrations (users, states, broker_orders, bot_settings/runs, sim_accounts/positions, audit_log).
- `lib/server/user-state.ts` — `loadUserState`. `app/api/state/route.ts` — GET/PUT synced state (baseUpdatedAt conflict).
- `lib/server/auth.ts` — sessions/JWT, `getSessionUser`, `hashPassphrase`/`verifyPassphrase`. `lib/server/crypto.ts` — AES-256-GCM (`encryptSecret`/`decryptSecret`).
- `lib/server/ratelimit.ts` — `limited`, `clientIp`, `crossSite`. `lib/server/audit.ts` — append-only `audit`, `AuditEvent`.
- `lib/server/totp.ts` + `lib/server/mfa-cookie.ts` — 2FA. `lib/server/lockout.ts` — account lockout. `lib/server/env.ts` — `assertProductionEnv`.
- `middleware.ts` — auth gate, CSRF origin check, **public-route allowlist**, bot-tick exemption.
- `next.config.mjs` — **CSP** (first-party; `unsafe-eval` dev-only) + security headers. `tailwind.config.ts` — themeable color tokens (green/amber).

## UI shell, terminal, theme — `app/` + `components/`
- `components/chrome.tsx` — nav, `Panel`, `Stat`, `fmtUsd/fmtPct/fmtN`, titles, ticker mount.
- `components/ticker-tape.tsx` — LED market strip. `app/terminal/page.tsx` — terminal dashboard (quote, chart, monitor, positions, blotter).
- `app/charts/page.tsx` + `components/market-chart.tsx` — indicator charts. `components/charts.tsx` — small charts (equity, R-dist).
- `components/theme-toggle.tsx` — green ⇄ Bloomberg amber. `app/globals.css` — token/theme CSS, terminal panels, ticker marquee.
- `components/status-strip.tsx`, `benchmarks-panel.tsx`, `broker-panel.tsx`, `security-panel.tsx`, `protection-banner.tsx`, `gate-band.tsx`, `assistant.tsx`, `toast.tsx`, `sync.tsx`, `workflow.tsx`, `logo.tsx`.
- Pages: `app/page.tsx` (Today), `daily`, `gate`, `portfolio`, `watchlist`, `journal`, `monthly`, `guides`, `help`, `group`, `settings`; auth: `login`, `join`, `reset`; legal: `terms`, `privacy`.

## Tests — `tests/` (Vitest, 114)
- `strategy`, `backtest`, `engine`, `sizing`(in engine), `validate`, `close-detect`, `daily-loss`, `benchmarks`, `stats`, `overview`, `account-summary`, `market-data`, `sim-broker`, `algo-report`, **`repro`** (runs the Python where available), `helpers.ts`.

---

## Safety invariants (do not relax — see `ARCHITECTURE.md`)
1. **LLMs never touch orders.** Validator rejects execution-ish keys; execution is its own preflight-gated path.
2. **The bot trades paper only** — code invariant in `bot.ts` (`conn.mode === "paper"`); `SimBroker` is paper by construction.
3. **Backtest = live = reproduce.** Entry rules live once in `strategy.ts`; the Python port matches trade-for-trade (`tests/repro.test.ts`).
4. **Fail closed.** No synced state → no orders. Unknown gate inputs → fails. Ambiguous order lookups → propagate.
5. **Idempotency everywhere an order can happen** — deterministic client order ids; duplicate submits return the original.

## Where to look for…
- Change an entry rule → `lib/engine/strategy.ts` (then backtest + bot + repro all follow).
- Change sizing/risk → `lib/engine/sizing.ts`, gate `lib/engine/gate.ts`, locks `lib/engine/protections.ts`.
- Order actually placed → `lib/server/execute-order.ts` → `lib/broker/*`.
- Real vs delayed data → `lib/server/history.ts` + `lib/market-data/`.
- Add an API route → `app/api/**/route.ts` (auth via `getSessionUser`, limit via `limited`).
- Theme/visual tokens → `tailwind.config.ts` + `app/globals.css`.
- DB shape → `lib/server/db.ts`.
