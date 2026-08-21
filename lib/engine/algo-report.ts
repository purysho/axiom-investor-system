import type { BacktestResult } from "./backtest";

/**
 * Turns a backtest run into a single self-contained document a user can hand to
 * ANY other AI (ChatGPT, Gemini, Claude, …) and ask "evaluate this algorithm
 * and its results." It describes the REAL strategy engine (kept in step with
 * lib/engine/strategy.ts and lib/engine/sizing.ts) and the REAL backtested
 * numbers — no marketing, every caveat included, so a reviewer can judge
 * whether the results are sound or overfit.
 *
 * Pure: input in, string out. No I/O.
 */

export interface AlgoReportInput {
  symbols: string[];
  missing: string[];
  benchmark: string;
  years: number;
  result: BacktestResult;
  /** ISO timestamp; injected so the output is deterministic in tests. */
  generatedAt: string;
  /** Human label of the feed the bars came from, e.g. the Alpaca or Stooq provider. */
  dataSource?: string;
}

const pct = (n: number | null | undefined, d = 1) =>
  n == null || Number.isNaN(n) ? "n/a" : `${n >= 0 ? "" : "−"}${Math.abs(n).toFixed(d)}%`;
const num = (n: number | null | undefined, d = 2) =>
  n == null || Number.isNaN(n) ? "n/a" : n.toFixed(d);
const usd = (n: number | null | undefined) =>
  n == null || Number.isNaN(n) ? "n/a" : `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/** Downsample the equity curve to at most `points` evenly-spaced samples. */
export function sampleEquityCurve(
  curve: { date: string; equity: number }[],
  points = 24,
): { date: string; equity: number }[] {
  if (curve.length <= points) return curve;
  const step = (curve.length - 1) / (points - 1);
  const out: { date: string; equity: number }[] = [];
  for (let i = 0; i < points; i++) out.push(curve[Math.round(i * step)]);
  // Always include the true last point.
  if (out[out.length - 1].date !== curve[curve.length - 1].date) out.push(curve[curve.length - 1]);
  return out;
}

/**
 * The algorithm specification — plain language + exact numbers, transcribed
 * from lib/engine/strategy.ts and lib/engine/sizing.ts. If those rules change,
 * this text must change with them; the report is only useful if it is exact.
 */
export function algorithmSpecMarkdown(): string {
  return `## The algorithm (exact rules)

**Type.** Rules-based, long-only swing trading on **daily bars**. Deterministic:
the same conditions always produce the same signal. No machine learning, no
discretionary overrides, no shorting.

**Indicators**, computed per symbol from daily closes/OHLC:
- SMA20, SMA50, SMA200 — simple moving averages of the close.
- RSI14 — Wilder's Relative Strength Index, 14-period.
- ATR14 — Average True Range as the **simple mean of the last 14 true ranges**.

**Entry rule 1 — Trend pullback** (checked first; confidence 0.55). Enter long when ALL hold:
- \`close > SMA200\` — the long-term trend is up;
- \`38 ≤ RSI14 ≤ 55\` — momentum has cooled but is not oversold;
- \`|close − SMA20| / close < 0.02\` — price is resting within 2% of its 20-day average (a pullback, not a breakout).
- **Stop** = \`entry − 2 × ATR14\`. **Target** = \`entry + 2 × (entry − stop)\` (a 2R reward-to-risk bracket).

**Entry rule 2 — Mean reversion** (confidence 0.50). Enter long when ALL hold:
- \`close > SMA200\` — still in a long-term uptrend;
- \`RSI14 < 32\` — short-term washed out.
- **Stop** = \`entry − 2.5 × ATR14\` (wider, to survive the noise that created the setup). **Target** = \`entry + 1.5 × (entry − stop)\` (a humbler 1.5R).

"entry" is the signal bar's close for reference; live/backtest fills happen on the **next** bar's open.

**Position sizing** (risk-first, never conviction-first):
- \`risk$ = portfolioValue × riskPerTradePct / 100\`
- \`perShareRisk = entry − stop\`
- \`shares = floor(risk$ / perShareRisk)\`, then capped so \`shares × entry ≤ portfolioValue × notionalCapPct / 100\` (single-position cap).
- A trade whose stop distance is zero is rejected (no divide-by-zero sizing).

**Exits.** Each position is a bracket: protective **stop** and profit **target** submitted together. An optional time-stop closes at the close after N bars. Nothing is held without a stop.

**Risk controls layered on top (enforced live, only partly in backtest):**
- A six-check market **risk gate** (benchmark vs 200-day, VIX ceiling, financial-conditions index, personal drawdown, aggregate open risk, unaccepted event risk). Unknown inputs count as fails.
- **Portfolio heat cap** — total planned open risk across positions is capped (default 6% of equity).
- **Behavioural protections** — cooldowns, revenge-trade guard, stop-out streak lock, drawdown lock, per-symbol loss lock, outstanding-reflection lock.
- The backtest replays only the benchmark-trend gate check, the heat cap, and a concurrency cap; it does NOT model VIX/NFCI/drawdown gating, behavioural locks, or dividends.

### Pseudocode

\`\`\`
for each trading day t (after 260-bar indicator warm-up):
    if benchmarkFilter and benchmark.close[t] <= benchmark.SMA200[t]: skip new entries
    for each symbol s with no open position:
        sig = signalAt(s, t)                     # rule 1 or rule 2 above, or none
        if sig is null: continue
        shares = sizeByRisk(sig.entry, sig.stop) # risk-first, then notional cap
        if adding it would breach heat cap or max concurrent: skip (recorded)
        enter at next bar's open + slippage; place stop + target bracket
    for each open position:
        if bar touches stop and target same day -> assume STOP (conservative)
        else fill whichever the bar reaches; gaps fill at the open
        charge slippage on exit
\`\`\`
`;
}

export function buildAlgorithmReportMarkdown(input: AlgoReportInput): string {
  const { result: r, symbols, missing, benchmark, years } = input;
  const m = r.metrics;
  const p = r.params;
  const finalEquity = r.equityCurve.length ? r.equityCurve[r.equityCurve.length - 1].equity : p.startingEquity;
  const vsBench =
    m.benchmarkReturnPct == null ? "n/a" : `${pct(m.totalReturnPct - m.benchmarkReturnPct)} vs ${benchmark} buy-and-hold`;

  // Actual coverage — never claim more than the data delivered.
  const tradingDays = r.equityCurve.length;
  const calendarDays = m.startDate && m.endDate
    ? Math.max(0, Math.round((Date.parse(m.endDate) - Date.parse(m.startDate)) / 86_400_000))
    : null;
  const expectedTradingDays = Math.round(years * 252);
  const coverageShort = tradingDays > 0 && tradingDays < expectedTradingDays * 0.75;
  const canAnnualize = tradingDays >= 200; // ~10 trading months
  const thinSample = m.trades < 30;
  const windowLabel = m.startDate ? `${m.startDate} → ${m.endDate}` : "n/a";
  const spanLabel = `${tradingDays} trading days${calendarDays != null ? ` / ${calendarDays} calendar days` : ""}`;

  const coverageWarning = (coverageShort || thinSample || !canAnnualize)
    ? `> ⚠️ **Read the numbers with caution.** This run covered **${spanLabel}** (${windowLabel})${coverageShort ? `, well short of the ~${expectedTradingDays} trading days a ${years}-year test implies — the symbols' available history was shorter than requested` : ""}, and produced **${m.trades} completed trade${m.trades === 1 ? "" : "s"}**. ${thinSample ? "Fewer than ~30 trades is statistical noise, not evidence. " : ""}${!canAnnualize ? "The window is under ~10 months, so any annualized/CAGR figure below is an extrapolation and should not be trusted. " : ""}Broaden the universe and lengthen the window before drawing conclusions.\n\n`
    : "";

  const curve = sampleEquityCurve(r.equityCurve, 24);
  const curveBlock = curve.map((c) => `${c.date},${Math.round(c.equity)}`).join("\n");

  const tradeRows = r.trades.slice(-60).map((t) =>
    `| ${t.symbol} | ${t.strategy} | ${t.entryDate} | ${num(t.entryPrice)} | ${t.exitDate} | ${num(t.exitPrice)} | ${t.exitReason} | ${t.holdBars} | ${usd(t.pl)} | ${t.rMultiple >= 0 ? "+" : ""}${num(t.rMultiple)}R |`,
  ).join("\n");

  return `# AXIOM strategy — algorithm & backtest report

_Generated ${input.generatedAt} · for independent review._

## For the reviewer (read me first)

${coverageWarning}You are being asked to **evaluate a rules-based swing-trading algorithm**. Below is
its complete specification followed by its backtested results. The test covered
**${spanLabel}** (${windowLabel}) of daily bars from **${input.dataSource ?? "the configured data feed"}** —
requested as a ${years}-year window. Nothing here is a solicitation or a claim of future
returns — it is a transparency artifact. Please assess:

1. Is the entry/exit logic sound, or does it have obvious flaws or blind spots?
2. Do the results look **plausible or overfit**? Is the sample of trades large enough to mean anything?
3. What are the **failure modes** — how would this behave in a sharp bear market, a choppy range, or a low-volatility grind?
4. Is the **risk framework** (risk-first sizing, stops on every trade, heat cap, behavioural locks) adequate?
5. What single change would most improve robustness?

Please be skeptical. The author wants holes found, not encouragement.

${algorithmSpecMarkdown()}

## Backtest configuration

| Setting | Value |
|---|---|
| Universe | ${symbols.join(", ") || "n/a"}${missing.length ? ` (no data for: ${missing.join(", ")})` : ""} |
| Data source | ${input.dataSource ?? "delayed end-of-day daily bars"} |
| Benchmark | ${benchmark} |
| Requested window | ${years} year${years === 1 ? "" : "s"} (~${expectedTradingDays} trading days) |
| Actual coverage | **${spanLabel}** (${windowLabel})${coverageShort ? " — shorter than requested" : ""} |
| Starting equity | ${usd(p.startingEquity)} |
| Risk per trade | ${p.riskPerTradePct}% of equity |
| Single-position cap | ${p.notionalCapPct}% of equity |
| Portfolio heat cap | ${p.heatCapPct}% of equity |
| Max concurrent positions | ${p.maxConcurrent} |
| Slippage charged | ${p.slippageBps} bps per side |
| Strategies enabled | ${p.strategies.join(", ")} |
| Benchmark-trend filter | ${p.benchmarkFilter ? "on (only enter while benchmark > its 200-day)" : "off"} |
| Per-symbol re-entry cooldown | ${p.perSymbolCooldownBars > 0 ? `${p.perSymbolCooldownBars} bars after a stop-out` : "off"} |
| Entry confirmation | ${p.requireEntryConfirmation ? "on (bullish close in upper half of range)" : "off"} |

**Fill assumptions (deliberately pessimistic):** signals fill at the *next* bar's
open; a bar touching both stop and target counts as a **stop**; gaps fill at the
open, not at the level; slippage is charged on every fill both ways.

## Results

${coverageWarning}| Metric | Value |
|---|---|
| Period return (whole window) | **${pct(m.totalReturnPct)}** (${vsBench}) |
| Ending equity | ${usd(finalEquity)} from ${usd(p.startingEquity)} |
| Annualized (CAGR) | ${canAnnualize ? pct(m.cagrPct) : `${pct(m.cagrPct)} — ⚠️ window under ~10 months; extrapolation, do not rely on it`} |
| Max drawdown | −${num(m.maxDrawdownPct)}% |
| Trades | ${m.trades} (${m.wins}W / ${m.losses}L) |
| Win rate | ${pct(m.winRatePct)} |
| Expectancy | ${m.expectancyR == null ? "n/a" : `${m.expectancyR >= 0 ? "+" : ""}${num(m.expectancyR)}R per trade`} |
| Profit factor | ${num(m.profitFactor)} |
| Avg hold | ${m.avgHoldBars == null ? "n/a" : `${num(m.avgHoldBars, 1)} trading days`} |
| Exposure | ${pct(m.exposurePct)} of days with a position |

**Entries the engine wanted but refused** (a healthy sign the risk layer bites):
benchmark filter ${r.skipped.benchmark}, heat cap ${r.skipped.heat}, concurrency ${r.skipped.concurrency}, sizing ${r.skipped.size}, gapped-through-stop ${r.skipped.gapThroughStop}, per-symbol cooldown ${r.skipped.cooldown}.
${r.warnings.length ? `\n**Warnings:** ${r.warnings.join("; ")}\n` : ""}
### Equity curve (sampled, \`date,equity\`)

\`\`\`
${curveBlock}
\`\`\`

### Trades${r.trades.length > 60 ? ` (most recent 60 of ${m.trades})` : ""}

${m.trades === 0 ? "_No trades were taken in this window — the entry conditions never all aligned. That is itself a result: the strategy sits out when its edge is absent._" : `| Symbol | Strategy | Entry date | Entry | Exit date | Exit | Reason | Held | P&L | R |
|---|---|---|---|---|---|---|---|---|---|
${tradeRows}`}

## Honesty caveats (please weigh these)

- **Past results do not predict future returns.** A backtest is evidence about the
  entry/exit engine, not a promise.
- Data is **delayed end-of-day** from a free source; real fills, spreads, halts,
  and dividends are not fully modeled.
- The backtest is an **upper bound**: it omits the VIX/financial-conditions/drawdown
  gate checks and the behavioural locks that would, live, keep the strategy out of
  some of these trades.
- A small trade count (say, under ~30) is **not statistically meaningful** — treat
  a short window or narrow universe accordingly.
- The strategy is **long-only and trend-conditioned** (it needs price above the
  200-day average), so it is structurally designed to step aside in bear markets —
  which also means it will miss V-shaped bottoms.

_This report was produced by the AXIOM investor system from its own strategy engine and backtester. You may reproduce the numbers by running the same engine over the same symbols and window._
`;
}

/** Machine-readable twin of the Markdown report, for AIs/tools that prefer JSON. */
export function buildAlgorithmReportJson(input: AlgoReportInput): string {
  const { result: r } = input;
  return JSON.stringify(
    {
      kind: "axiom-algorithm-report",
      version: 1,
      generatedAt: input.generatedAt,
      disclaimer: "Transparency artifact. Not investment advice. Past results do not predict future returns. Backtest is an upper bound (omits macro gate checks, behavioural locks, dividends).",
      window: {
        requestedYears: input.years,
        startDate: r.metrics.startDate,
        endDate: r.metrics.endDate,
        tradingDays: r.equityCurve.length,
        coverageShort: r.equityCurve.length > 0 && r.equityCurve.length < Math.round(input.years * 252) * 0.75,
        annualizable: r.equityCurve.length >= 200,
      },
      dataSource: input.dataSource ?? "delayed end-of-day daily bars",
      universe: input.symbols,
      missingData: input.missing,
      benchmark: input.benchmark,
      params: r.params,
      fillAssumptions: {
        entry: "next bar open + slippage",
        ambiguousBar: "stop assumed first",
        gaps: "fill at open",
        slippageBps: r.params.slippageBps,
      },
      metrics: r.metrics,
      refusedEntries: r.skipped,
      warnings: r.warnings,
      equityCurve: sampleEquityCurve(r.equityCurve, 60),
      trades: r.trades,
    },
    null,
    2,
  );
}
