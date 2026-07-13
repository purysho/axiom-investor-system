# AXIOM Bot — the paper autopilot

The bot is the Copilot with the click removed. It scans a small universe on
daily bars, and when the entry rules, your risk engine, and every interlock
agree, it submits a **paper** bracket order to your connected paper broker —
either an Alpaca paper account or the built-in simulator (`lib/broker/sim.ts`,
no API keys or signup; fills at last close ± the same 5 bps slippage the
backtester charges). It is at `/bot`.

## One pipeline, three consumers

The entry rules live in exactly one file, `lib/engine/strategy.ts`:

- the **Copilot** scan proposes from it (`/api/copilot`),
- the **backtester** replays it over history (`/api/backtest`, `lib/engine/backtest.ts`),
- the **bot** trades it (`lib/server/bot.ts`).

If a rule changes, all three change together. A backtest is only evidence if
it runs the code that trades — this is how that stays true.

Order submission is also one code path: `lib/server/execute-order.ts` does the
write-ahead record, the idempotent submit, and the status update for both the
manual order route and the bot. Bracket orders are GTC so the protective stop
survives overnight (a "day" bracket would cancel its unfilled stop leg at the
close).

## The interlocks, in the order the bot hits them

Every run walks this list and logs the answer to each step — including the
runs that do nothing. See "Run history" on `/bot`.

1. **Synced state exists.** No server-side copy of your rules → no trades.
   The bot never takes the client's word for anything.
2. **Kill switch** (yours, in the app) — on means the run ends here.
3. **Risk gate** — `NO NEW SWINGS` stands the bot down. `REDUCED RISK ONLY`
   halves size and records a documented exception, exactly like a manual entry.
4. **Behavioural protections** — cooldowns, stop-out guards, drawdown locks,
   outstanding journal reflections. The bot obeys your own history.
5. **Broker is connected and is a PAPER account.** A live connection stands
   the bot down. This is code (`lib/server/bot.ts`), not a setting, and there
   is deliberately no flag to change it. The built-in simulator is paper by
   construction — it has no live mode to misconfigure.
6. **Market is open** (broker clock). No queuing into the open.
7. **Daily order cap** — shared with manual orders (5/day).
8. **Signals** from the shared strategy engine over the universe.
9. **Deterministic validator** — recomputed sizing, heat cap, concurrency cap,
   the same `validateRecommendation` the Copilot uses.
10. **Preflight against live broker state** — buying power, real-equity
    notional cap, restriction flags, the 5%-of-equity hard backstop.
11. **Idempotent submit** — client order id `axiom-bot-<user>-<date>-<symbol>`,
    so retries and double-firing crons cannot double a position.

After a submit, the bot writes the trade into your synced state so the journal,
the gate's open-risk check, and the protections all see it on their next
evaluation. If a browser tab was open at the time, its next sync may show a
conflict banner — choose "use server copy".

## Running it

**Manually** — `/bot` → *Run now*. *Dry run* walks every interlock and reports
what would happen without submitting; it works even while the bot is off.

**On a schedule** — set `BOT_CRON_TOKEN` (32+ random chars) in the deployment
environment, then have any scheduler POST during market hours:

```bash
curl -X POST -H "Authorization: Bearer $BOT_CRON_TOKEN" https://your-app/api/bot/tick
```

The strategy works on daily bars, so once or twice a day is plenty — e.g. an
hour after the open. Cron sources that work: `cron-job.org`, GitHub Actions
`schedule`, `fly machine run --schedule`, or plain crontab on a VPS. Without
the token the endpoint answers 503 and does nothing.

The tick runs every enabled user sequentially and reports per-user outcomes.
Duplicate ticks are safe: the per-day idempotency key means the second tick
finds the first tick's order and stops.

## Backtesting

`/bot` → *Run backtest* replays the strategy over up to 10 years of Stooq
daily history with your actual risk settings. Fill assumptions are
deliberately pessimistic:

- a signal on today's close fills at **tomorrow's open**, never today's;
- a bar that touches both the stop and the target counts as a **stop**;
- gaps fill at the open, not at your level;
- slippage is charged on both sides (default 5 bps);
- indicator warm-up (260 bars) is enforced, so backtest numbers match what a
  live scan would compute for the same day.

What it does **not** model by default: the VIX/NFCI/drawdown gate checks (only
the benchmark-trend check is replayed), most behavioural protections, and
dividends. Read results as evidence about the process, not a promised return.

**Optional per-symbol re-entry cooldown.** Live, a symbol that stops out is
locked from re-entry by the behavioural protections; the backtest doesn't model
that, so it can re-enter a name a bar or two after a stop — a trade the running
system would refuse. The backtest control (and `perSymbolCooldownBars`) blocks
re-entry on a symbol for N bars after it stops out, making the replay more
faithful to live behaviour. Default is off (0) so historical numbers are
unchanged; turn it on to test re-entry discipline out-of-sample.

The exported report states the **actual** coverage — trading-day count and date
range — not the requested window, and refuses to annualize a window under ~10
months. If a symbol has less history than the requested years, the report says
so rather than overstating the period.

**Real data via your own keys.** A signed-in user who has connected an Alpaca
account (paper keys are fine — the data API reads with any Alpaca key) gets real
split/dividend-adjusted IEX bars in backtests automatically, no deployment key or
redeploy needed. Without a connection it falls back to the deployment key, then
Stooq.

**Entry confirmation** (optional, off by default) lives in the shared strategy
engine (`signalAt`), so enabling it applies the *same* same-bar filter — a bullish
close in the upper half of the range — to both the backtest and the live bot. That
preserves "backtest what you trade": the confirmation toggle on the bot page saves
to the bot's settings and is passed straight into the backtest, so both replay and
live use one rule. It only ever filters signals; it never creates them. Treat it as
a hypothesis to test on real data, not a guaranteed improvement.

### Export for a second opinion — evaluate OR reproduce

After a backtest, three exports (all built from the same run):

- **Report (.md)** / **.json** (`lib/engine/algo-report.ts`) — the exact
  algorithm, config, and results with a "be skeptical, hunt for overfitting"
  framing. For an AI (or human) to **evaluate**.
- **Reproducible .py** (`lib/engine/algo-repro.ts`, `/api/backtest/repro`) — a
  single self-contained pure-Python file: a faithful port of the strategy and
  backtester with **this run's exact OHLC data embedded**. `python3 file.py`
  reproduces the numbers with zero dependencies and no network. Hand it to a
  series of AIs with a code sandbox to **reproduce** (not just opine on) the
  results — which is what an external audit actually needs (the strategy code
  and the data). The port is validated against the canonical TS engine
  trade-for-trade by `tests/repro.test.ts` (runs wherever python3 exists), so
  "reproduce what you backtest" holds the same way "backtest what you trade"
  does. The **Broad universe (20)** button gives it a statistically meaningful
  sample to reproduce.

Everything carries every caveat and makes no forward-looking claim.

## The path to live

Live autopilot does not exist and is not planned as a switch. The stated
progression stands: 20+ paper trades, positive expectancy, no heat-cap
breaches — and live orders stay human-approved one at a time behind
`ALLOW_LIVE_TRADING` and the typed confirmation.
