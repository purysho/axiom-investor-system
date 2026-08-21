import { NextResponse } from "next/server";
import {
  bollingerBands, ema, macd, mapToStooq,
  rsiArray, round, sma, WARMUP_BARS,
} from "@/lib/engine/quotes";
import { clientIp, limited } from "@/lib/server/ratelimit";
import { getSessionUser } from "@/lib/server/auth";
import { fetchDailyHistoryForUser, usesRealData } from "@/lib/server/history";

export const dynamic = "force-dynamic";

/**
 * GET /api/chart?symbol=AAPL&range=6m
 * Returns full OHLCV series + all technical indicators pre-computed.
 * range: 1w | 1m | 3m | 6m | 1y | 2y (default 6m)
 */
export async function GET(req: Request) {
  const url    = new URL(req.url);
  const ticker = (url.searchParams.get("symbol") ?? "").trim();
  const range  = url.searchParams.get("range") ?? "6m";

  if (!ticker) return NextResponse.json({ error: "symbol is required" }, { status: 400 });
  // Generous for humans flipping ranges; stops scripted relays to the upstream feed.
  if (limited(`chart:${clientIp(req)}`, 60, 5 * 60_000))
    return NextResponse.json({ error: "Too many chart requests — slow down a little." }, { status: 429 });

  const stooq = mapToStooq(ticker);
  const visibleDays = { "1w": 10, "1m": 35, "3m": 95, "6m": 190, "1y": 380, "2y": 760 }[range] ?? 190;

  // Fetch enough trading bars to cover the visible window PLUS the indicator
  // warm-up (RSI/EMA/MACD are recursive) — see WARMUP_BARS in quotes.ts.
  const wantBars = Math.round(visibleDays * 5 / 7) + WARMUP_BARS;

  const user = await getSessionUser();

  try {
    // Real Alpaca bars from the user's own keys when connected; else Stooq.
    const rows = await fetchDailyHistoryForUser(user?.id ?? null, ticker, wantBars, 1800);
    if (!rows || rows.length === 0) throw new Error("no data");
    const real = await usesRealData(user?.id ?? null);

    const closes = rows.map((r) => r.close);
    const highs  = rows.map((r) => r.high);
    const lows   = rows.map((r) => r.low);

    const sma20  = sma(closes, 20);
    const sma50  = sma(closes, 50);
    const sma200 = sma(closes, 200);
    const ema20  = ema(closes, 20);
    const bb     = bollingerBands(closes, 20, 2);
    const macdI  = macd(closes);
    const rsiI   = rsiArray(closes, 14);

    // Only bars inside the requested range are returned; the warm-up is discarded
    // *after* the indicators have been computed over the full series.
    const cutoffMs = Date.now() - visibleDays * 86400000;
    const allCandles = rows.map((r, i) => ({
      time:   r.date,
      open:   round(r.open, 4),
      high:   round(r.high, 4),
      low:    round(r.low, 4),
      close:  round(r.close, 4),
      volume: r.volume,
      // Indicators (null = not enough history)
      sma20:  round(sma20[i], 4),
      sma50:  round(sma50[i], 4),
      sma200: round(sma200[i], 4),
      ema20:  round(ema20[i], 4),
      bbUpper:round(bb.upper[i], 4),
      bbMid:  round(bb.mid[i], 4),
      bbLower:round(bb.lower[i], 4),
      macd:   round(macdI.macd[i], 4),
      macdSig:round(macdI.signal[i], 4),
      macdHist:round(macdI.hist[i], 4),
      rsi:    round(rsiI[i], 2),
    }));
    const candles = allCandles.filter((c) => new Date(c.time).getTime() >= cutoffMs);

    // Summary stats for the header
    const last   = rows[rows.length - 1];
    const prev   = rows[rows.length - 2];
    const chg    = prev ? last.close - prev.close : 0;
    const chgPct = prev ? (chg / prev.close) * 100 : 0;
    const hi52   = Math.max(...rows.slice(-252).map((r) => r.high));
    const lo52   = Math.min(...rows.slice(-252).map((r) => r.low));

    return NextResponse.json({
      ticker,
      stooq,
      candles,
      summary: {
        close:   round(last.close, 4),
        open:    round(last.open, 4),
        high:    round(last.high, 4),
        low:     round(last.low, 4),
        volume:  last.volume,
        chg:     round(chg, 4),
        chgPct:  round(chgPct, 2),
        hi52:    round(hi52, 4),
        lo52:    round(lo52, 4),
        date:    last.date,
      },
      warmupBars: rows.length - candles.length,
      source: real ? "Alpaca IEX (real, your keys)" : "Stooq (delayed EOD)",
      note: real ? "Real IEX daily bars via your connected keys." : "Delayed end-of-day data. Verify before acting.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Data unavailable — check the symbol or try again later.", detail: String(e) },
      { status: 502 },
    );
  }
}
