import { NextResponse } from "next/server";
import { computeWatchMetrics, mapToStooq, round } from "@/lib/engine/quotes";
import { clientIp, limited } from "@/lib/server/ratelimit";
import { getSessionUser } from "@/lib/server/auth";
import { fetchDailyHistoryForUser, usesRealData } from "@/lib/server/history";

export const dynamic = "force-dynamic";

/**
 * GET /api/quotes?symbols=AAPL,SPY,XAUUSD,BTCUSD&mode=close|metrics
 *
 * close   → latest daily close per symbol (portfolio "refresh prices")
 * metrics → close, % change, volume vs 20-day avg, % from 52-week high, RSI(14)
 *           computed from ~400 sessions of history (watchlist "fetch data")
 *
 * Everything is Stooq's free delayed end-of-day data, fetched per symbol so a
 * bad ticker degrades to a per-symbol error instead of failing the batch.
 */

const MAX_SYMBOLS = 25;

interface QuoteOut {
  ticker: string;
  stooq: string;
  close: number | null;
  date: string | null;
  metrics?: {
    price: number | null;
    pct_change: number | null;
    volume_x_avg: number | null;
    pct_from_52w_high: number | null;
    rsi: number | null;
  };
  error?: string;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "metrics" ? "metrics" : "close";
  const raw = (url.searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (raw.length === 0) return NextResponse.json({ error: "symbols required" }, { status: 400 });
  if (raw.length > MAX_SYMBOLS)
    return NextResponse.json({ error: `Too many symbols — ${MAX_SYMBOLS} max per request.` }, { status: 400 });
  // Each call can already batch 25 symbols; 20 calls per 5 min is far beyond
  // human use and keeps scripted loops off the free upstream feed.
  if (limited(`quotes:${clientIp(req)}`, 20, 5 * 60_000))
    return NextResponse.json({ error: "Too many quote requests — wait a moment." }, { status: 429 });

  // Metrics can lean on a longer cache; closes refresh a little more often.
  const revalidate = mode === "metrics" ? 6 * 3600 : 1800;
  const user = await getSessionUser();
  const real = await usesRealData(user?.id ?? null);

  const out: QuoteOut[] = await Promise.all(
    raw.map(async (ticker): Promise<QuoteOut> => {
      const stooq = mapToStooq(ticker);
      try {
        // Real Alpaca bars from the user's own keys when connected; else Stooq.
        const rows = await fetchDailyHistoryForUser(user?.id ?? null, ticker, 400, revalidate);
        if (!rows || rows.length === 0) throw new Error("no data");
        const last = rows[rows.length - 1];
        const base: QuoteOut = { ticker, stooq, close: round(last.close, 4), date: last.date };
        if (mode === "metrics") {
          const m = computeWatchMetrics(rows);
          base.metrics = {
            price: round(m.price, 4),
            pct_change: round(m.pct_change, 2),
            volume_x_avg: round(m.volume_x_avg, 2),
            pct_from_52w_high: round(m.pct_from_52w_high, 2),
            rsi: round(m.rsi, 1),
          };
        }
        return base;
      } catch {
        return { ticker, stooq, close: null, date: null, error: "unavailable — check the symbol or enter manually" };
      }
    }),
  );

  return NextResponse.json({
    mode,
    quotes: out,
    source: real ? "Alpaca IEX (real, your keys)" : "Stooq (free, delayed EOD)",
    note: real ? "Real IEX daily bars via your connected keys." : "Delayed end-of-day data for a daily-cadence process; verify before acting. Unknown symbols stay blank.",
    fetchedAt: new Date().toISOString(),
  });
}
