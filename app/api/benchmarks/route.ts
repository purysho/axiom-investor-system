import { NextResponse } from "next/server";
import { clientIp, limited } from "@/lib/server/ratelimit";
import { BENCHMARK_SET, buildBenchmarkReport } from "@/lib/engine/benchmarks";
import { fetchDailyHistory } from "@/lib/server/history";

export const dynamic = "force-dynamic";

/**
 * GET /api/benchmarks — cross-asset context for the monthly review: S&P 500,
 * gold, bitcoin, EUR/USD, and long Treasuries over standard windows. Data is
 * delayed EOD and cached hard (6h): review context, not a ticker tape.
 */
export async function GET(req: Request) {
  if (limited(`benchmarks:${clientIp(req)}`, 10, 10 * 60_000))
    return NextResponse.json({ error: "Too many requests — benchmark data is end-of-day; it hasn't changed." }, { status: 429 });

  const now = Date.now();
  const reports = await Promise.all(
    BENCHMARK_SET.map(async (def) => buildBenchmarkReport(def, await fetchDailyHistory(def.symbol, 400, 6 * 3600), now)),
  );

  const missing = reports.filter((r) => r.asOf === null).map((r) => r.label);
  return NextResponse.json({
    ok: true,
    benchmarks: reports,
    missing,
    citations: ["Stooq daily history (delayed EOD)"],
    note: "Cross-asset context for review — not signals, not advice.",
  });
}
