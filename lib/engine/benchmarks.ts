import type { DailyRow } from "./quotes";

/**
 * Cross-asset benchmark comparison — pure math over daily closes.
 *
 * The point is context, not envy: a monthly review that only compares against
 * one index quietly assumes equities are the whole opportunity set. Seeing the
 * same window across stocks, gold, crypto, FX, and bonds tells you whether
 * "the market" moved or just your corner of it.
 */

export interface BenchmarkDef {
  id: string;
  label: string;
  /** Symbol in the app's quote conventions (mapToStooq handles the rest). */
  symbol: string;
  assetClass: "Equity" | "Metal" | "Crypto" | "FX" | "Bond";
}

/** The comparison set from the roadmap: S&P 500, gold, crypto, forex, bonds. */
export const BENCHMARK_SET: BenchmarkDef[] = [
  { id: "spx", label: "S&P 500", symbol: "SPY", assetClass: "Equity" },
  { id: "gold", label: "Gold", symbol: "XAUUSD", assetClass: "Metal" },
  { id: "btc", label: "Bitcoin", symbol: "BTCUSD", assetClass: "Crypto" },
  { id: "eurusd", label: "Euro vs USD", symbol: "EURUSD", assetClass: "FX" },
  // TODO: swap for a total-bond-market series if a keyless source appears;
  // TLT (20y+ Treasuries ETF) is the best free daily proxy Stooq offers.
  { id: "bonds", label: "US Treasuries 20y+ (TLT)", symbol: "TLT", assetClass: "Bond" },
];

export interface WindowReturns {
  r1m: number | null;
  r3m: number | null;
  r6m: number | null;
  r1y: number | null;
  ytd: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Close on the last bar at or before `date` (YYYY-MM-DD); null if none. */
function closeOnOrBefore(rows: DailyRow[], date: string): number | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].date <= date) return rows[i].close;
  }
  return null;
}

function pctFrom(base: number | null, last: number): number | null {
  return base !== null && base > 0 ? round2(((last / base) - 1) * 100) : null;
}

const dayShift = (nowMs: number, days: number) => new Date(nowMs - days * 86_400_000).toISOString().slice(0, 10);

/** Returns over standard review windows, measured from the latest bar. */
export function returnsOverWindows(rows: DailyRow[], nowMs: number): WindowReturns {
  if (rows.length === 0) return { r1m: null, r3m: null, r6m: null, r1y: null, ytd: null };
  const last = rows[rows.length - 1].close;
  const yearStart = `${new Date(nowMs).toISOString().slice(0, 4)}-01-01`;
  return {
    r1m: pctFrom(closeOnOrBefore(rows, dayShift(nowMs, 30)), last),
    r3m: pctFrom(closeOnOrBefore(rows, dayShift(nowMs, 91)), last),
    r6m: pctFrom(closeOnOrBefore(rows, dayShift(nowMs, 182)), last),
    r1y: pctFrom(closeOnOrBefore(rows, dayShift(nowMs, 365)), last),
    ytd: pctFrom(closeOnOrBefore(rows, yearStart), last),
  };
}

/** Last `n` closes rebased to 100 at the window start — sparkline fodder. */
export function rebasedTail(rows: DailyRow[], n = 60): number[] {
  const tail = rows.slice(-n);
  if (tail.length < 2 || tail[0].close <= 0) return [];
  return tail.map((r) => round2((r.close / tail[0].close) * 100));
}

export interface BenchmarkReport extends BenchmarkDef {
  returns: WindowReturns;
  spark: number[];
  lastClose: number | null;
  asOf: string | null;
}

export function buildBenchmarkReport(
  def: BenchmarkDef,
  rows: DailyRow[] | null,
  nowMs: number,
): BenchmarkReport {
  if (!rows || rows.length === 0) {
    return { ...def, returns: { r1m: null, r3m: null, r6m: null, r1y: null, ytd: null }, spark: [], lastClose: null, asOf: null };
  }
  return {
    ...def,
    returns: returnsOverWindows(rows, nowMs),
    spark: rebasedTail(rows),
    lastClose: rows[rows.length - 1].close,
    asOf: rows[rows.length - 1].date,
  };
}
