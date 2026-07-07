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
