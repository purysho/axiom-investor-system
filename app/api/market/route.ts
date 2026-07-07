import { NextResponse } from "next/server";

export const runtime = "nodejs";

const REVALIDATE_SECONDS = 6 * 60 * 60; // EOD cadence — free-tier friendly

interface SeriesPoint {
  date: string;
  value: number;
}

async function fetchFredSeries(id: string): Promise<SeriesPoint | null> {
  try {
    const res = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, {
      next: { revalidate: REVALIDATE_SECONDS },
      headers: { "User-Agent": "investor-discipline-web/0.1 (personal, non-commercial)" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.trim().split("\n");
    for (let i = lines.length - 1; i > 0; i--) {
      const [date, raw] = lines[i].split(",");
      const value = Number(raw);
      if (Number.isFinite(value)) return { date, value };
    }
    return null;
  } catch {
    return null;
  }
}

interface BenchResult {
  close: number;
  sma200: number;
  aboveSma200: boolean;
  date: string;
}

/** Stooq keyless EOD history; compute the 200-day SMA ourselves. */
async function fetchBenchmark(symbol: string): Promise<BenchResult | null> {
  try {
    const res = await fetch(
      `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`,
      { next: { revalidate: REVALIDATE_SECONDS } },
    );
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.trim().split("\n").slice(1); // Date,Open,High,Low,Close,Volume
    const closes: { date: string; close: number }[] = [];
    for (const line of lines) {
      const parts = line.split(",");
      const close = Number(parts[4]);
      if (Number.isFinite(close)) closes.push({ date: parts[0], close });
    }
    if (closes.length < 200) return null;
    const last200 = closes.slice(-200);
    const sma200 = last200.reduce((a, c) => a + c.close, 0) / 200;
    const last = closes[closes.length - 1];
    return {
      close: last.close,
      sma200: Math.round(sma200 * 100) / 100,
      aboveSma200: last.close > sma200,
      date: last.date,
    };
  } catch {
    return null;
  }
}

/** Optional Alpha Vantage fallback for the latest benchmark quote (free key, 25 req/day). */
async function fetchAlphaVantageQuote(symbol: string): Promise<{ price: number; date: string } | null> {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${key}`,
      { next: { revalidate: REVALIDATE_SECONDS } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { "Global Quote"?: Record<string, string> };
    const q = json["Global Quote"];
    const price = Number(q?.["05. price"]);
    if (!Number.isFinite(price)) return null;
    return { price, date: q?.["07. latest trading day"] ?? "" };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("benchmark") ?? "spy.us";
  const avSymbol = symbol.replace(/\.us$/i, "").toUpperCase();

  const [vix, nfci, bench, avQuote] = await Promise.all([
    fetchFredSeries("VIXCLS"),
    fetchFredSeries("NFCI"),
    fetchBenchmark(symbol),
    fetchAlphaVantageQuote(avSymbol),
  ]);

  return NextResponse.json({
    asOf: new Date().toISOString(),
    vix: vix ? { value: vix.value, date: vix.date, source: "FRED VIXCLS" } : null,
    nfci: nfci ? { value: nfci.value, date: nfci.date, source: "FRED NFCI" } : null,
    benchmark: bench
      ? { ...bench, symbol, source: "Stooq EOD (delayed)" }
      : avQuote
        ? {
            close: avQuote.price,
            sma200: null,
            aboveSma200: null,
            date: avQuote.date,
            symbol: avSymbol,
            source: "Alpha Vantage GLOBAL_QUOTE (delayed)",
          }
        : null,
    note: "Free-tier, delayed, end-of-day data. Verify before acting; unknown values count as failed gate checks.",
  });
}
