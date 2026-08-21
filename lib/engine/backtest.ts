import type { DailyRow } from "./quotes";
import { computeSizing } from "./sizing";
import { computeIndicators, signalAt, FIRST_TRADABLE_BAR, type StrategyId, type StrategySignal } from "./strategy";

/**
 * Deterministic daily-bar backtester for the AXIOM strategy engine.
 *
 * Honesty rules, in order of importance:
 *  1. It replays the SAME code that trades (lib/engine/strategy.ts, computeSizing) —
 *     never a reimplementation of it.
 *  2. No lookahead: a signal on bar i fills at bar i+1's open.
 *  3. When a bar touches both the stop and the target, the stop is assumed to
 *     have hit first. Gaps fill at the open, not at the level.
 *  4. Slippage is charged on every fill, both ways.
 *
 * What it deliberately does NOT model: the six-check risk gate beyond the
 * benchmark-trend check (VIX/NFCI/drawdown are macro series we can't replay
 * faithfully from EOD files), behavioural protections, and dividends. Treat
 * results as an upper bound on the entry/exit engine, not a promise.
 */

export interface BacktestParams {
  startingEquity: number;
  riskPerTradePct: number;
  notionalCapPct: number;
  heatCapPct: number;
  maxConcurrent: number;
  /** Bars to hold before a discipline exit at the close. 0 = rely on the bracket only. */
  timeStopBars: number;
  /** Per-side slippage in basis points. */
  slippageBps: number;
  strategies: StrategyId[];
  /** Only enter while the benchmark closes above its 200-day SMA (gate check #1). */
  benchmarkFilter: boolean;
  /**
   * Bars to wait before re-entering a symbol after it stops out — an optional
   * approximation of the live per-symbol loss lock, so the backtest doesn't
   * take re-entries the running system's behavioural protections would block.
   * 0 = off (default), which leaves historical results unchanged.
   */
  perSymbolCooldownBars: number;
  /**
   * Require same-bar entry confirmation (bullish close in the upper half of the
   * range). Applied via the shared signalAt, so enabling it here and on the bot
   * keeps "backtest what you trade" true. Off by default.
   */
  requireEntryConfirmation: boolean;
}

export const DEFAULT_BACKTEST_PARAMS: BacktestParams = {
  startingEquity: 100_000,
  riskPerTradePct: 0.5,
  notionalCapPct: 20,
  heatCapPct: 6,
  maxConcurrent: 3,
  timeStopBars: 0,
  slippageBps: 5,
  strategies: ["trend-pullback", "mean-reversion"],
  benchmarkFilter: true,
  perSymbolCooldownBars: 0,
  requireEntryConfirmation: false,
};

export type ExitReason = "stop" | "target" | "time" | "end";

export interface BacktestTrade {
  symbol: string;
  strategy: string;
  signalDate: string;
  entryDate: string;
  entryPrice: number;
  qty: number;
  stop: number;
  target: number;
  exitDate: string;
  exitPrice: number;
  exitReason: ExitReason;
  pl: number;
  rMultiple: number;
  holdBars: number;
}

export interface BacktestMetrics {
  totalReturnPct: number;
  cagrPct: number | null;
  maxDrawdownPct: number;
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number | null;
  expectancyR: number | null;
  profitFactor: number | null;
  avgHoldBars: number | null;
  exposurePct: number;
  benchmarkReturnPct: number | null;
  startDate: string | null;
  endDate: string | null;
}

export interface BacktestResult {
  params: BacktestParams;
  trades: BacktestTrade[];
  equityCurve: { date: string; equity: number }[];
  metrics: BacktestMetrics;
  /** Entries the engine wanted but refused, and why — the part a marketing page would hide. */
  skipped: { benchmark: number; heat: number; concurrency: number; size: number; gapThroughStop: number; cooldown: number };
  warnings: string[];
}

interface OpenPosition {
  symbol: string;
  strategy: string;
  signalDate: string;
  entryDate: string;
  entryPrice: number;
  qty: number;
  stop: number;
  target: number;
  holdBars: number;
  /** Most recent close seen, for marking days when this symbol's market is shut. */
  lastClose: number;
}

interface PendingEntry {
  signal: StrategySignal;
  signalDate: string;
  /** Bar index in the symbol's own series at which to fill (signal bar + 1). */
  fillIndex: number;
}

export function runBacktest(
  series: Record<string, DailyRow[]>,
  params: Partial<BacktestParams> = {},
  benchmarkRows: DailyRow[] | null = null,
): BacktestResult {
  const p: BacktestParams = { ...DEFAULT_BACKTEST_PARAMS, ...params };
  const warnings: string[] = [];
  const skipped = { benchmark: 0, heat: 0, concurrency: 0, size: 0, gapThroughStop: 0, cooldown: 0 };
  // Bar index of the most recent stop-out per symbol, for the re-entry cooldown.
  const lastStopIndex = new Map<string, number>();

  const symbols = Object.keys(series).filter((s) => (series[s]?.length ?? 0) > 0);
  // Minimum usable length: a signal at FIRST_TRADABLE_BAR needs one more bar to fill on.
  const usable = symbols.filter((s) => series[s].length >= FIRST_TRADABLE_BAR + 2);
  for (const s of symbols) {
    if (!usable.includes(s)) warnings.push(`${s}: only ${series[s].length} bars of history — needs ${FIRST_TRADABLE_BAR + 2}+ for indicator warm-up, skipped.`);
  }

  const indicators = new Map(usable.map((s) => [s, computeIndicators(series[s])]));
  const dateIndex = new Map(usable.map((s) => [s, new Map(series[s].map((r, i) => [r.date, i]))]));

  // Benchmark-trend filter: date → benchmark close above its 200-day SMA.
  let benchAbove: Map<string, boolean> | null = null;
  if (p.benchmarkFilter) {
    if (benchmarkRows && benchmarkRows.length > 200) {
      const bi = computeIndicators(benchmarkRows);
      benchAbove = new Map(benchmarkRows.map((r, i) => [r.date, bi.sma200[i] !== null && r.close > (bi.sma200[i] as number)]));
    } else {
      warnings.push("Benchmark filter requested but no benchmark history supplied — filter disabled.");
    }
  }

  // Union trading calendar across every usable symbol, tradable region only.
  const dates = [...new Set(usable.flatMap((s) => series[s].slice(FIRST_TRADABLE_BAR).map((r) => r.date)))].sort();
  if (dates.length === 0) {
    return {
      params: p, trades: [], equityCurve: [], skipped, warnings: [...warnings, "No symbol has enough history to trade."],
      metrics: emptyMetrics(),
    };
  }

  const slip = p.slippageBps / 10_000;
  let cash = p.startingEquity;
  let equity = p.startingEquity;
  const open = new Map<string, OpenPosition>();
  const pending = new Map<string, PendingEntry>();
  const closed: BacktestTrade[] = [];
  const equityCurve: { date: string; equity: number }[] = [];
  let daysExposed = 0;

  const openRiskUsd = () => [...open.values()].reduce((sum, o) => sum + (o.entryPrice - o.stop) * o.qty, 0);

  const closePosition = (pos: OpenPosition, date: string, rawPrice: number, reason: ExitReason) => {
    const exitPrice = rawPrice * (1 - slip);
    cash += pos.qty * exitPrice;
    const perShareRisk = pos.entryPrice - pos.stop;
    closed.push({
      symbol: pos.symbol, strategy: pos.strategy, signalDate: pos.signalDate,
      entryDate: pos.entryDate, entryPrice: round2(pos.entryPrice), qty: pos.qty,
      stop: pos.stop, target: pos.target,
      exitDate: date, exitPrice: round2(exitPrice), exitReason: reason,
      pl: round2((exitPrice - pos.entryPrice) * pos.qty),
      rMultiple: perShareRisk > 0 ? round2((exitPrice - pos.entryPrice) / perShareRisk) : 0,
      holdBars: pos.holdBars,
    });
    open.delete(pos.symbol);
  };

  for (const date of dates) {
    // 1 — Fill entries queued from the previous bar's signal.
    for (const [symbol, pe] of [...pending]) {
      const rows = series[symbol];
      const idx = dateIndex.get(symbol)!.get(date);
      if (idx === undefined) continue;              // symbol has no bar today; wait
      pending.delete(symbol);
      if (idx !== pe.fillIndex) continue;           // calendar drift; drop stale intent
      const bar = rows[idx];
      const fill = bar.open * (1 + slip);
      if (fill <= pe.signal.stop) { skipped.gapThroughStop++; continue; } // gapped through the stop overnight
      if (open.size >= p.maxConcurrent) { skipped.concurrency++; continue; }

      const sized = computeSizing({
        portfolioValue: equity,
        riskPerTradePct: p.riskPerTradePct,
        entry: fill,
        stop: pe.signal.stop,
        target: pe.signal.takeProfit,
        notionalCapPct: p.notionalCapPct,
      });
      const qty = sized.cappedShares ?? 0;
      if (qty < 1) { skipped.size++; continue; }
      const newRisk = (fill - pe.signal.stop) * qty;
      if (openRiskUsd() + newRisk > (p.heatCapPct / 100) * equity) { skipped.heat++; continue; }
      if (qty * fill > cash) { skipped.size++; continue; } // cash account, no margin

      cash -= qty * fill;
      open.set(symbol, {
        symbol, strategy: pe.signal.strategy, signalDate: pe.signalDate,
        entryDate: date, entryPrice: fill, qty,
        stop: pe.signal.stop, target: pe.signal.takeProfit, holdBars: 0, lastClose: bar.close,
      });
    }

    // 2 — Manage what's open: stop first, then target, then the time stop.
    for (const pos of [...open.values()]) {
      const idx = dateIndex.get(pos.symbol)!.get(date);
      if (idx === undefined) continue;
      const bar = series[pos.symbol][idx];
      pos.lastClose = bar.close;
      if (bar.date > pos.entryDate) pos.holdBars++;
      if (bar.open <= pos.stop) { closePosition(pos, date, bar.open, "stop"); lastStopIndex.set(pos.symbol, idx); }
      else if (bar.low <= pos.stop) { closePosition(pos, date, pos.stop, "stop"); lastStopIndex.set(pos.symbol, idx); }
      else if (bar.open >= pos.target) closePosition(pos, date, bar.open, "target");
      else if (bar.high >= pos.target) closePosition(pos, date, pos.target, "target");
      else if (p.timeStopBars > 0 && pos.holdBars >= p.timeStopBars) closePosition(pos, date, bar.close, "time");
    }

    // 3 — Look for new signals at today's close, to fill tomorrow.
    for (const symbol of usable) {
      const idx = dateIndex.get(symbol)!.get(date);
      if (idx === undefined || idx < FIRST_TRADABLE_BAR || idx >= series[symbol].length - 1) continue;
      if (open.has(symbol) || pending.has(symbol)) continue;
      if (open.size + pending.size >= p.maxConcurrent) continue;
      // Per-symbol re-entry cooldown after a stop-out (optional; 0 = off).
      if (p.perSymbolCooldownBars > 0) {
        const stoppedAt = lastStopIndex.get(symbol);
        if (stoppedAt !== undefined && idx - stoppedAt < p.perSymbolCooldownBars) { skipped.cooldown++; continue; }
      }
      const sig = signalAt(symbol, series[symbol], indicators.get(symbol)!, idx, p.strategies, { confirm: p.requireEntryConfirmation });
      if (!sig) continue;
      if (benchAbove && benchAbove.get(date) !== true) { skipped.benchmark++; continue; }
      pending.set(symbol, { signal: sig, signalDate: date, fillIndex: idx + 1 });
    }

    // 4 — Mark to market.
    let mv = 0;
    for (const pos of open.values()) mv += pos.qty * pos.lastClose;
    equity = cash + mv;
    if (open.size > 0) daysExposed++;
    equityCurve.push({ date, equity: round2(equity) });
  }

  // Anything still open settles at its final close so the ledger balances.
  for (const pos of [...open.values()]) {
    const rows = series[pos.symbol];
    closePosition(pos, rows[rows.length - 1].date, rows[rows.length - 1].close, "end");
  }

  return {
    params: p,
    trades: closed,
    equityCurve,
    skipped,
    warnings,
    metrics: computeMetrics(closed, equityCurve, p.startingEquity, daysExposed, benchmarkRows),
  };
}

function computeMetrics(
  trades: BacktestTrade[],
  curve: { date: string; equity: number }[],
  startingEquity: number,
  daysExposed: number,
  benchmarkRows: DailyRow[] | null,
): BacktestMetrics {
  if (curve.length === 0) return emptyMetrics();
  const final = curve[curve.length - 1].equity;
  const totalReturnPct = (final / startingEquity - 1) * 100;

  const startDate = curve[0].date;
  const endDate = curve[curve.length - 1].date;
  const years = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (365.25 * 86400000);
  const cagrPct = years > 0.25 && final > 0 ? ((final / startingEquity) ** (1 / years) - 1) * 100 : null;

  let peak = -Infinity;
  let maxDd = 0;
  for (const pt of curve) {
    peak = Math.max(peak, pt.equity);
    if (peak > 0) maxDd = Math.max(maxDd, (peak - pt.equity) / peak);
  }

  const wins = trades.filter((t) => t.pl > 0).length;
  const losses = trades.filter((t) => t.pl < 0).length;
  const grossWin = trades.filter((t) => t.pl > 0).reduce((a, t) => a + t.pl, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.pl < 0).reduce((a, t) => a + t.pl, 0));

  let benchmarkReturnPct: number | null = null;
  if (benchmarkRows && benchmarkRows.length > 1) {
    const inWindow = benchmarkRows.filter((r) => r.date >= startDate && r.date <= endDate);
    if (inWindow.length > 1) benchmarkReturnPct = round2((inWindow[inWindow.length - 1].close / inWindow[0].close - 1) * 100);
  }

  return {
    totalReturnPct: round2(totalReturnPct),
    cagrPct: cagrPct !== null ? round2(cagrPct) : null,
    maxDrawdownPct: round2(maxDd * 100),
    trades: trades.length,
    wins,
    losses,
    winRatePct: trades.length ? round2((wins / trades.length) * 100) : null,
    expectancyR: trades.length ? round2(trades.reduce((a, t) => a + t.rMultiple, 0) / trades.length) : null,
    profitFactor: grossLoss > 0 ? round2(grossWin / grossLoss) : null,
    avgHoldBars: trades.length ? round2(trades.reduce((a, t) => a + t.holdBars, 0) / trades.length) : null,
    exposurePct: round2((daysExposed / curve.length) * 100),
    benchmarkReturnPct,
    startDate,
    endDate,
  };
}

function emptyMetrics(): BacktestMetrics {
  return {
    totalReturnPct: 0, cagrPct: null, maxDrawdownPct: 0, trades: 0, wins: 0, losses: 0,
    winRatePct: null, expectancyR: null, profitFactor: null, avgHoldBars: null,
    exposurePct: 0, benchmarkReturnPct: null, startDate: null, endDate: null,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
