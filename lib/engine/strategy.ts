import type { DailyRow } from "./quotes";
import { WARMUP_BARS } from "./quotes";

/**
 * The AXIOM strategy engine — ONE implementation of the entry rules, shared by
 * the Copilot scan, the backtester, and the bot. If the rule that trades live
 * and the rule that gets backtested ever diverge, the backtest is fiction;
 * keeping them in this file is how we prevent that.
 *
 * Pure functions only: bars in, signal out. No I/O, no clocks, no state.
 * Everything here is advisory — sizing, gate, protections, and preflight are
 * enforced elsewhere and always win.
 */

export type StrategyId = "trend-pullback" | "mean-reversion";

export interface StrategySignal {
  symbol: string;
  strategy: "Trend pullback" | "Mean reversion";
  strategyId: StrategyId;
  /** Reference entry = the signal bar's close. Live fills will differ slightly. */
  entry: number;
  stop: number;
  takeProfit: number;
  confidence: number;
  evidence: string[];
  /** Plain-English condition that voids the thesis. */
  invalidation: string;
  /** Date of the signal bar — the newest data the signal is built on. */
  dataAsOf: string;
  technical: Record<string, number | string | null>;
}

/** Per-bar indicator series, each aligned to `rows` by index. */
export interface IndicatorSeries {
  sma20: (number | null)[];
  sma50: (number | null)[];
  sma200: (number | null)[];
  rsi14: (number | null)[];
  /** Mean of the last 14 true ranges (matches the Copilot's original ATR). */
  atr14: (number | null)[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function smaSeries(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= period) sum -= closes[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Wilder RSI as a per-bar series, seeded from the first `period` deltas then
 * updated recursively — identical values to running rsi() over each prefix,
 * but O(n) instead of O(n²).
 */
function rsiSeries(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  const value = () =>
    avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
  out[period] = value();
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = value();
  }
  return out;
}

function atrSeries(rows: DailyRow[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(rows.length).fill(null);
  const trs: number[] = [];
  let sum = 0;
  for (let i = 1; i < rows.length; i++) {
    const tr = Math.max(
      rows[i].high - rows[i].low,
      Math.abs(rows[i].high - rows[i - 1].close),
      Math.abs(rows[i].low - rows[i - 1].close),
    );
    trs.push(tr);
    sum += tr;
    if (trs.length > period) sum -= trs[trs.length - 1 - period];
    if (trs.length >= period) out[i] = sum / period;
  }
  return out;
}

export function computeIndicators(rows: DailyRow[]): IndicatorSeries {
  const closes = rows.map((r) => r.close);
  return {
    sma20: smaSeries(closes, 20),
    sma50: smaSeries(closes, 50),
    sma200: smaSeries(closes, 200),
    rsi14: rsiSeries(closes, 14),
    atr14: atrSeries(rows, 14),
  };
}

/**
 * Evaluate the entry rules at bar `i` (normally the last bar). Long-only by
 * design: Axiom's methodology does not short.
 *
 * Rule 1 — Trend pullback: long-term uptrend (close above the 200-day SMA),
 * price resting at the 20-day SMA with RSI 38–55. Stop 2×ATR, target 2R.
 *
 * Rule 2 — Mean reversion: still above the 200-day SMA but RSI washed out
 * below 32. Wider 2.5×ATR stop, humbler 1.5R target.
 */
export interface SignalOptions {
  /**
   * Require the signal bar to confirm a turn back up — a bullish close (close
   * above open) in the upper half of the bar's range — so entries skip setups
   * where price is still falling into the signal. Same-bar and deterministic,
   * so the backtest and the live bot apply the identical rule (both call this
   * function). Off by default; the caller opts in.
   */
  confirm?: boolean;
}

export function signalAt(
  symbol: string,
  rows: DailyRow[],
  ind: IndicatorSeries,
  i: number,
  enabled: StrategyId[] = ["trend-pullback", "mean-reversion"],
  opts: SignalOptions = {},
): StrategySignal | null {
  if (i < 0 || i >= rows.length) return null;
  const close = rows[i].close;
  const sma20 = ind.sma20[i];
  const sma200 = ind.sma200[i];
  const rsi14 = ind.rsi14[i];
  const atr = ind.atr14[i] ?? close * 0.02;

  // Same-bar entry confirmation (optional): bullish close in the upper half.
  const bar = rows[i];
  const range = bar.high - bar.low;
  const confirmed = bar.close > bar.open && (range <= 0 || (bar.close - bar.low) >= 0.5 * range);
  if (opts.confirm && !confirmed) return null;

  if (
    enabled.includes("trend-pullback") &&
    sma200 !== null && close > sma200 &&
    sma20 !== null && rsi14 !== null &&
    rsi14 >= 38 && rsi14 <= 55 &&
    Math.abs(close - sma20) / close < 0.02
  ) {
    const entry = round2(close);
    const stop = round2(entry - 2 * atr);
    if (stop <= 0) return null;
    return {
      symbol, strategy: "Trend pullback", strategyId: "trend-pullback",
      entry, stop, takeProfit: round2(entry + 2 * (entry - stop)),
      confidence: 0.55,
      evidence: [
        `Price ${round2(close)} is above its 200-day average (${round2(sma200)}) — long-term uptrend intact.`,
        `Pulled back to the 20-day average with RSI ${rsi14.toFixed(0)} — resting, not overheated.`,
        `Stop set 2×ATR below entry (ATR14 ≈ ${round2(atr)}).`,
      ],
      invalidation: `A daily close below the stop (${stop}) or below the 200-day average voids the trend thesis.`,
      dataAsOf: rows[i].date,
      technical: { close, sma20, sma200, rsi14, atr14: round2(atr) },
    };
  }

  if (
    enabled.includes("mean-reversion") &&
    sma200 !== null && close > sma200 &&
    rsi14 !== null && rsi14 < 32
  ) {
    const entry = round2(close);
    const stop = round2(entry - 2.5 * atr);
    if (stop <= 0) return null;
    return {
      symbol, strategy: "Mean reversion", strategyId: "mean-reversion",
      entry, stop, takeProfit: round2(entry + 1.5 * (entry - stop)),
      confidence: 0.5,
      evidence: [
        `RSI ${rsi14.toFixed(0)} — short-term washed out while still above the 200-day average.`,
        `Betting on reversion toward the mean, not a new trend; smaller reward target (1.5R).`,
        `Wider 2.5×ATR stop to survive the noise that created the setup.`,
      ],
      invalidation: `A daily close below the stop (${stop}) or a break of the 200-day average ends the reversion case.`,
      dataAsOf: rows[i].date,
      technical: { close, sma200, rsi14, atr14: round2(atr) },
    };
  }

  return null;
}

/** Signal on the most recent bar — what the Copilot scan and the bot use. */
export function latestSignal(
  symbol: string,
  rows: DailyRow[],
  enabled?: StrategyId[],
  opts?: SignalOptions,
): StrategySignal | null {
  if (rows.length < 30) return null;
  return signalAt(symbol, rows, computeIndicators(rows), rows.length - 1, enabled, opts);
}

/**
 * First bar index the backtester may act on. Recursive indicators (RSI, ATR)
 * need warm-up before their values match what a live scan (which always loads
 * WARMUP_BARS of history) would compute for the same day.
 */
export const FIRST_TRADABLE_BAR = WARMUP_BARS;
