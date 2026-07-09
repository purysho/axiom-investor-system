/**
 * Quote plumbing for Stooq's free CSV endpoints — pure functions only, so the
 * math is testable without a network. The API route is a thin fetch wrapper.
 *
 * Symbol conventions (what users type → what Stooq wants):
 *   AAPL, SPY        → aapl.us, spy.us      (bare tickers assume a US listing)
 *   vusa.uk, btc.v   → unchanged            (a dot means "already a Stooq symbol")
 *   XAUUSD, BTCUSD   → xauusd, btcusd       (recognized spot/crypto/FX pairs)
 */

/** Spot metals, majors, and large-cap crypto pairs Stooq quotes directly. */
const PAIR_SYMBOLS = new Set([
  "xauusd", "xagusd", "xptusd", "xpdusd", // gold, silver, platinum, palladium
  "btcusd", "ethusd", "solusd", "adausd", "xrpusd", "ltcusd", "dogeusd", "bnbusd", "dotusd",
  "eurusd", "gbpusd", "usdjpy", "usdchf", "audusd", "usdcad", "nzdusd",
]);

export function mapToStooq(ticker: string): string {
  const t = ticker.trim().toLowerCase();
  if (!t) return t;
  if (t.includes(".") || t.startsWith("^")) return t; // explicit Stooq symbol (vusa.uk, ^spx)
  if (PAIR_SYMBOLS.has(t)) return t;
  return `${t}.us`;
}

export interface DailyRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

/** Parse Stooq's daily-history CSV (Date,Open,High,Low,Close,Volume). */
export function parseStooqDaily(csv: string): DailyRow[] {
  const rows: DailyRow[] = [];
  for (const line of csv.trim().split("\n").slice(1)) {
    const [date, o, h, l, c, v] = line.split(",");
    const open = Number(o), high = Number(h), low = Number(l), close = Number(c);
    if (!date || !Number.isFinite(close)) continue;
    rows.push({
      date,
      open: Number.isFinite(open) ? open : close,
      high: Number.isFinite(high) ? high : close,
      low: Number.isFinite(low) ? low : close,
      close,
      volume: v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null,
    });
  }
  return rows;
}

/** Wilder's RSI over closes; null with fewer than period+1 closes. */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface WatchMetricsResult {
  price: number | null;
  pct_change: number | null;
  volume_x_avg: number | null;
  pct_from_52w_high: number | null;
  rsi: number | null;
  date: string | null;
}

/** Compute every watchlist metric from a daily-history window (~400 sessions max is plenty). */
export function computeWatchMetrics(rows: DailyRow[]): WatchMetricsResult {
  const n = rows.length;
  if (n === 0) return { price: null, pct_change: null, volume_x_avg: null, pct_from_52w_high: null, rsi: null, date: null };
  const last = rows[n - 1];
  const prev = n >= 2 ? rows[n - 2] : null;

  const yearWindow = rows.slice(Math.max(0, n - 252));
  const high52 = Math.max(...yearWindow.map((r) => r.high));

  // Volume vs the prior 20 sessions (excluding today), when volumes exist.
  const priorVols = rows
    .slice(Math.max(0, n - 21), n - 1)
    .map((r) => r.volume)
    .filter((v): v is number => v !== null && v > 0);
  const avgVol = priorVols.length >= 5 ? priorVols.reduce((a, b) => a + b, 0) / priorVols.length : null;

  return {
    price: last.close,
    pct_change: prev ? ((last.close / prev.close) - 1) * 100 : null,
    volume_x_avg: avgVol && last.volume ? last.volume / avgVol : null,
    pct_from_52w_high: high52 > 0 ? ((last.close / high52) - 1) * 100 : null,
    rsi: rsi(rows.map((r) => r.close)),
    date: last.date,
  };
}

/** Round to a sensible display precision without turning numbers into strings. */
export function round(n: number | null, dp = 2): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// ── Additional indicators ──────────────────────────────────────────────────

/** Simple Moving Average */
export function sma(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    const slice = closes.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

/** Exponential Moving Average */
export function ema(closes: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = [];
  let prev: number | null = null;
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    if (i === period - 1) {
      prev = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
      out.push(prev); continue;
    }
    prev = closes[i] * k + prev! * (1 - k);
    out.push(prev);
  }
  return out;
}

/** Bollinger Bands — returns upper, middle (SMA), lower */
export function bollingerBands(closes: number[], period = 20, mult = 2): {
  upper: (number | null)[]; mid: (number | null)[]; lower: (number | null)[];
} {
  const mid = sma(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  closes.forEach((_, i) => {
    if (i < period - 1) { upper.push(null); lower.push(null); return; }
    const slice = closes.slice(i - period + 1, i + 1);
    const m = mid[i]!;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - m) ** 2, 0) / period);
    upper.push(m + mult * std);
    lower.push(m - mult * std);
  });
  return { upper, mid, lower };
}

/** MACD — returns macd line, signal, histogram */
export function macd(closes: number[], fast = 12, slow = 26, signal = 9): {
  macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[];
} {
  const fastEma = ema(closes, fast);
  const slowEma = ema(closes, slow);
  const macdLine = closes.map((_, i) =>
    fastEma[i] !== null && slowEma[i] !== null ? fastEma[i]! - slowEma[i]! : null
  );
  // Signal = EMA of macd line (only over non-null values)
  const macdValues = macdLine.filter((v): v is number => v !== null);
  const signalValues = ema(macdValues, signal);
  let sigIdx = 0;
  const signalLine = macdLine.map((v) => (v === null ? null : (signalValues[sigIdx++] ?? null)));
  const hist = macdLine.map((m, i) =>
    m !== null && signalLine[i] !== null ? m - signalLine[i]! : null
  );
  return { macd: macdLine, signal: signalLine, hist };
}

/** RSI array (per-bar) rather than a single value */
export function rsiArray(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    out.push(rsi(closes.slice(0, i + 1), period));
  }
  return out;
}

// ── Indicator warm-up ──────────────────────────────────────────────────────
//
// RSI (Wilder), EMA and MACD are *recursive*: each bar's value depends on the
// previous bar's, so the value at the final bar depends on how far back the
// series starts. Computing RSI(14) from 35 bars and from 800 bars gives
// different answers for the same day — measured drift on our own code was
// ~6 RSI points and ~26% on the MACD line, enough to flip an entry condition
// in ~9% of series. (Freqtrade calls this "recursive analysis"; the
// intelligent-trading-bot README calls it guaranteeing the same derived
// features offline and online. Same failure.)
//
// Fix: always compute indicators over at least WARMUP_BARS of history, then
// slice for display. Every surface then agrees on the same number.

/** Trading days of history to load before the first bar we intend to use. */
export const WARMUP_BARS = 260;

/** Calendar days needed to be confident of getting `bars` trading days. */
export function calendarDaysFor(bars: number): number {
  return Math.ceil(bars * 1.45) + 10;
}
