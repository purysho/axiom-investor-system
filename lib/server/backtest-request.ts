import { WARMUP_BARS, type DailyRow } from "@/lib/engine/quotes";
import { DEFAULT_BACKTEST_PARAMS, runBacktest, type BacktestParams, type BacktestResult } from "@/lib/engine/backtest";
import type { StrategyId } from "@/lib/engine/strategy";
import { fetchDailyHistoryForUser, usesRealData } from "@/lib/server/history";
import { listProviders } from "@/lib/market-data";

/**
 * Shared parse → fetch → run for the backtest endpoints. Both the JSON results
 * route and the reproducible-Python route go through here, so they can never
 * disagree about symbols, params, or data.
 */

const clamp = (n: unknown, lo: number, hi: number, dflt: number): number => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
};

export interface BacktestRequestBody {
  symbols?: unknown; years?: unknown; benchmark?: unknown; params?: Record<string, unknown>;
}

export interface PreparedBacktest {
  symbols: string[];
  missing: string[];
  benchmark: string;
  years: number;
  params: BacktestParams;
  series: Record<string, DailyRow[]>;
  benchmarkRows: DailyRow[] | null;
  result: BacktestResult;
  dataSource: string;
}

export type PrepareError = { error: string; status: number };

export function isPrepareError(x: PreparedBacktest | PrepareError): x is PrepareError {
  return (x as PrepareError).error !== undefined;
}

export async function prepareBacktest(
  body: BacktestRequestBody,
  userId: string | null,
): Promise<PreparedBacktest | PrepareError> {
  // Backtesting is pure analysis (no orders), so it allows a broad universe for
  // a statistically meaningful run — wider than the bot's live 8-symbol cap.
  const symbols = [...new Set((Array.isArray(body.symbols) ? body.symbols : [])
    .filter((s): s is string => typeof s === "string" && /^[A-Za-z0-9.^-]{1,12}$/.test(s.trim()))
    .map((s) => s.trim().toUpperCase()))]
    .slice(0, 25);
  if (symbols.length === 0) return { error: "Send symbols: [] — up to 25 tickers.", status: 400 };

  const years = clamp(body.years, 1, 10, 5);
  const bars = Math.round(years * 252) + WARMUP_BARS;

  const raw = body.params ?? {};
  const d = DEFAULT_BACKTEST_PARAMS;
  const params: BacktestParams = {
    startingEquity: clamp(raw.startingEquity, 1_000, 10_000_000, d.startingEquity),
    riskPerTradePct: clamp(raw.riskPerTradePct, 0.1, 2, d.riskPerTradePct),
    notionalCapPct: clamp(raw.notionalCapPct, 5, 100, d.notionalCapPct),
    heatCapPct: clamp(raw.heatCapPct, 1, 20, d.heatCapPct),
    maxConcurrent: clamp(raw.maxConcurrent, 1, 8, d.maxConcurrent),
    timeStopBars: clamp(raw.timeStopBars, 0, 200, d.timeStopBars),
    slippageBps: clamp(raw.slippageBps, 0, 100, d.slippageBps),
    perSymbolCooldownBars: clamp(raw.perSymbolCooldownBars, 0, 60, d.perSymbolCooldownBars),
    requireEntryConfirmation: raw.requireEntryConfirmation === undefined ? d.requireEntryConfirmation : Boolean(raw.requireEntryConfirmation),
    strategies: (Array.isArray(raw.strategies)
      ? raw.strategies.filter((s): s is StrategyId => s === "trend-pullback" || s === "mean-reversion")
      : d.strategies),
    benchmarkFilter: raw.benchmarkFilter === undefined ? d.benchmarkFilter : Boolean(raw.benchmarkFilter),
  };
  if (params.strategies.length === 0) params.strategies = d.strategies;

  const benchmark =
    typeof body.benchmark === "string" && /^[A-Za-z0-9.^-]{1,12}$/.test(body.benchmark.trim())
      ? body.benchmark.trim().toUpperCase()
      : "SPY";

  const getHistory = (s: string) => fetchDailyHistoryForUser(userId, s, bars, 6 * 3600);
  const [histories, benchmarkRows] = await Promise.all([
    Promise.all(symbols.map(async (s) => ({ symbol: s, rows: await getHistory(s) }))),
    getHistory(benchmark),
  ]);

  const series: Record<string, DailyRow[]> = {};
  const missing: string[] = [];
  for (const h of histories) {
    if (h.rows && h.rows.length > 0) series[h.symbol] = h.rows;
    else missing.push(h.symbol);
  }
  if (Object.keys(series).length === 0)
    return { error: `No history found for ${symbols.join(", ")} — check the tickers.`, status: 502 };

  const result = runBacktest(series, params, benchmarkRows);
  const dataSource = (await usesRealData(userId))
    ? "Alpaca IEX daily bars (real, via your connected keys)"
    : listProviders()[0]?.label ?? "delayed end-of-day daily bars";

  return { symbols: Object.keys(series), missing, benchmark, years, params, series, benchmarkRows, result, dataSource };
}
