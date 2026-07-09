import { NextResponse } from "next/server";
import {
  bollingerBands, calendarDaysFor, ema, macd, mapToStooq, parseStooqDaily,
  rsiArray, round, sma, WARMUP_BARS,
} from "@/lib/engine/quotes";

export const revalidate = 1800; // 30-min server cache

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

  const stooq = mapToStooq(ticker);
  const visibleDays = { "1w": 10, "1m": 35, "3m": 95, "6m": 190, "1y": 380, "2y": 760 }[range] ?? 190;

  // Load extra history purely to warm the recursive indicators, then hide it.
  // Without this, RSI/EMA/MACD on a 1-month chart disagree with the same
  // indicators the Copilot uses — see WARMUP_BARS in lib/engine/quotes.ts.
  const fetchDays = visibleDays + calendarDaysFor(WARMUP_BARS);

  const d2 = new Date();
  const d1 = new Date(d2.getTime() - fetchDays * 86400000);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;

  try {
    const stooqUrl = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooq)}&i=d&d1=${fmt(d1)}&d2=${fmt(d2)}`;
    const res = await fetch(stooqUrl, {
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "axiom-investor-system/1.0" },
    });
    if (!res.ok) throw new Error(`stooq ${res.status}`);
    const text = await res.text();
    const rows = parseStooqDaily(text);
    if (rows.length === 0) throw new Error("no data");

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
      source: "Stooq (delayed EOD)",
      note: "Delayed end-of-day data. Verify before acting.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Data unavailable — check the symbol or try again later.", detail: String(e) },
      { status: 502 },
    );
  }
}
