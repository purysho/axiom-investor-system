import { NextResponse } from "next/server";
import { clientIp, limited } from "@/lib/server/ratelimit";
import { getSessionUser } from "@/lib/server/auth";
import { prepareBacktest, isPrepareError, type BacktestRequestBody } from "@/lib/server/backtest-request";
import { buildReproPython } from "@/lib/engine/algo-repro";

export const dynamic = "force-dynamic";

/**
 * POST /api/backtest/repro — same inputs as /api/backtest, but returns a
 * single self-contained Python file (embedded OHLC + a faithful port of the
 * strategy and backtester) that anyone — or any AI with a code sandbox — can
 * run to REPRODUCE the numbers independently. The port is validated against
 * the canonical TS engine trade-for-trade in tests.
 */
export async function POST(req: Request) {
  if (limited(`backtest-repro:${clientIp(req)}`, 5, 10 * 60_000))
    return NextResponse.json({ error: "Too many exports — try again in a few minutes." }, { status: 429 });

  let body: BacktestRequestBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body." }, { status: 400 }); }

  const user = await getSessionUser();
  const prep = await prepareBacktest(body, user?.id ?? null);
  if (isPrepareError(prep)) return NextResponse.json({ error: prep.error }, { status: prep.status });

  const py = buildReproPython({
    symbols: prep.symbols,
    benchmark: prep.benchmark,
    params: prep.params,
    series: prep.series,
    benchmarkRows: prep.benchmarkRows,
    dataSource: prep.dataSource,
    generatedAt: new Date().toISOString(),
  });

  return new NextResponse(py, {
    status: 200,
    headers: {
      "Content-Type": "text/x-python; charset=utf-8",
      "Content-Disposition": `attachment; filename="axiom_backtest_repro.py"`,
    },
  });
}
