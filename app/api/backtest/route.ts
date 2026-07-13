import { NextResponse } from "next/server";
import { clientIp, limited } from "@/lib/server/ratelimit";
import { WARMUP_BARS, type DailyRow } from "@/lib/engine/quotes";
import { DEFAULT_BACKTEST_PARAMS, runBacktest, type BacktestParams } from "@/lib/engine/backtest";
import type { StrategyId } from "@/lib/engine/strategy";
import { fetchDailyHistory } from "@/lib/server/history";
import { listProviders } from "@/lib/market-data";

export const dynamic = "force-dynamic";

/**
 * POST /api/backtest  { symbols: string[], years?: number, benchmark?: string, params?: Partial<BacktestParams> }
 * Replays the shared strategy engine over Stooq daily history. Pure analysis —
 * touches no account, no broker, no user state. Heavier than a scan, so the
 * rate limit is tighter.
 */

const clamp = (n: unknown, lo: number, hi: number, dflt: number): number => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;
};

export async function POST(req: Request) {
  if (limited(`backtest:${clientIp(req)}`, 5, 10 * 60_000))
    return NextResponse.json({ error: "Too many backtests — give the data source a breather and try again in a few minutes." }, { status: 429 });

  let body: { symbols?: unknown; years?: unknown; benchmark?: unknown; params?: Record<string, unknown> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body." }, { status: 400 }); }

  const symbols = (Array.isArray(body.symbols) ? body.symbols : [])
    .filter((s): s is string => typeof s === "string" && /^[A-Za-z0-9.^-]{1,12}$/.test(s.trim()))
    .map((s) => s.trim().toUpperCase())
    .slice(0, 8);
  if (symbols.length === 0) return NextResponse.json({ error: "Send symbols: [] — up to 8 tickers." }, { status: 400 });

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
    strategies: (Array.isArray(raw.strategies)
      ? raw.strategies.filter((s): s is StrategyId => s === "trend-pullback" || s === "mean-reversion")
      : d.strategies),
    benchmarkFilter: raw.benchmarkFilter === undefined ? d.benchmarkFilter : Boolean(raw.benchmarkFilter),
  };
  if (params.strategies.length === 0) params.strategies = d.strategies;

  const benchmarkSymbol =
    typeof body.benchmark === "string" && /^[A-Za-z0-9.^-]{1,12}$/.test(body.benchmark.trim())
      ? body.benchmark.trim().toUpperCase()
      : "SPY";

  const [histories, benchmarkRows] = await Promise.all([
    Promise.all(symbols.map(async (s) => ({ symbol: s, rows: await fetchDailyHistory(s, bars, 6 * 3600) }))),
    fetchDailyHistory(benchmarkSymbol, bars, 6 * 3600),
  ]);

  const series: Record<string, DailyRow[]> = {};
  const missing: string[] = [];
  for (const h of histories) {
    if (h.rows && h.rows.length > 0) series[h.symbol] = h.rows;
    else missing.push(h.symbol);
  }
  if (Object.keys(series).length === 0)
    return NextResponse.json({ error: `No history found for ${symbols.join(", ")} — check the tickers.` }, { status: 502 });

  const result = runBacktest(series, params, benchmarkRows);
  const dataSource = listProviders()[0]?.label ?? "delayed end-of-day daily bars";

  return NextResponse.json({
    ok: true,
    symbols: Object.keys(series),
    missing,
    benchmark: benchmarkSymbol,
    years,
    dataSource,
    result: {
      ...result,
      trades: result.trades.slice(-400), // cap the payload; metrics cover everything
    },
    citations: [dataSource, "Deterministic strategy engine — the same code the bot trades"],
    note: "Backtests use conservative fills (stop first, gaps at the open, slippage both ways) but remain an upper bound, not a promise. Past results do not predict future returns.",
  });
}
