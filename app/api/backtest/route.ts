import { NextResponse } from "next/server";
import { clientIp, limited } from "@/lib/server/ratelimit";
import { getSessionUser } from "@/lib/server/auth";
import { prepareBacktest, isPrepareError, type BacktestRequestBody } from "@/lib/server/backtest-request";

export const dynamic = "force-dynamic";

/**
 * POST /api/backtest  { symbols: string[], years?: number, benchmark?: string, params?: Partial<BacktestParams> }
 * Replays the shared strategy engine over daily history. Pure analysis —
 * touches no account, no broker, no user state. Heavier than a scan, so the
 * rate limit is tighter.
 */
export async function POST(req: Request) {
  if (limited(`backtest:${clientIp(req)}`, 5, 10 * 60_000))
    return NextResponse.json({ error: "Too many backtests — give the data source a breather and try again in a few minutes." }, { status: 429 });

  let body: BacktestRequestBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body." }, { status: 400 }); }

  const user = await getSessionUser();
  const prep = await prepareBacktest(body, user?.id ?? null);
  if (isPrepareError(prep)) return NextResponse.json({ error: prep.error }, { status: prep.status });

  return NextResponse.json({
    ok: true,
    symbols: prep.symbols,
    missing: prep.missing,
    benchmark: prep.benchmark,
    years: prep.years,
    dataSource: prep.dataSource,
    result: {
      ...prep.result,
      trades: prep.result.trades.slice(-400), // cap the payload; metrics cover everything
    },
    citations: [prep.dataSource, "Deterministic strategy engine — the same code the bot trades"],
    note: "Backtests use conservative fills (stop first, gaps at the open, slippage both ways) but remain an upper bound, not a promise. Past results do not predict future returns.",
  });
}
