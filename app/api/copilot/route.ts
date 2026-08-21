import { NextResponse } from "next/server";
import { clientIp, limited } from "@/lib/server/ratelimit";
import { WARMUP_BARS, type DailyRow } from "@/lib/engine/quotes";
import { computeIndicators, latestSignal } from "@/lib/engine/strategy";
import { fetchDailyHistory } from "@/lib/server/history";

export const dynamic = "force-dynamic";

/**
 * POST /api/copilot  { symbols: string[], gateState: string }
 * Feature-engineers each symbol from Stooq daily history, then asks the analyst
 * (Claude if ANTHROPIC_API_KEY is set, deterministic rules otherwise) for candidate
 * recommendations. Returns RAW candidates — the client runs every one through the
 * deterministic validator against live state before anything is shown as approvable.
 *
 * The rules analyst is the shared strategy engine (lib/engine/strategy.ts) — the
 * same code the backtester replays and the bot trades.
 */

interface Features {
  symbol: string;
  close: number;
  date: string;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi14: number | null;
  atr14: number | null;
  pctFrom52wHigh: number | null;
  ret20dPct: number | null;
}

function featuresFrom(ticker: string, rows: DailyRow[]): Features {
  const ind = computeIndicators(rows);
  const i = rows.length - 1;
  const last = rows[i];
  const closes = rows.map((r) => r.close);
  const yearHigh = Math.max(...rows.slice(-252).map((r) => r.high));
  return {
    symbol: ticker.toUpperCase(),
    close: last.close,
    date: last.date,
    sma20: ind.sma20[i],
    sma50: ind.sma50[i],
    sma200: ind.sma200[i],
    rsi14: ind.rsi14[i],
    atr14: ind.atr14[i],
    pctFrom52wHigh: yearHigh > 0 ? ((last.close / yearHigh) - 1) * 100 : null,
    ret20dPct: closes.length > 21 ? ((last.close / closes[closes.length - 21]) - 1) * 100 : null,
  };
}

interface RawRec {
  asset: string; side: "Long"; strategy: "Trend pullback" | "Mean reversion";
  entry: number; stop: number; takeProfits: number[];
  confidence: number; evidence: string[]; technical: Record<string, number | string | null>;
  invalidation?: string | null;
  dataAsOf?: string | null;
}

async function aiAnalyst(features: Features[], gateState: string, key: string): Promise<RawRec[] | null> {
  const sys = `You are the Copilot analyst inside Axiom Investor System. You receive engineered daily features for a handful of symbols and the current risk-gate state. Propose at most 3 LONG swing candidates as STRICT JSON — an array of objects with keys exactly: asset, side ("Long"), strategy ("Trend pullback" or "Mean reversion"), entry, stop, takeProfits (array of 1-2 numbers), confidence (0-1), evidence (array of 2-4 short plain-English strings citing the supplied numbers), invalidation (one short sentence: the condition that voids the thesis), technical (object echoing the key numbers used). Rules: entry = latest close; stop 1.5-3 ATR below entry; first target at least 1.5R above entry; only propose when the long-term trend (price vs sma200) supports it; if nothing qualifies return []. No prose, no markdown — JSON only. You do not size positions and you do not execute anything.`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ASSISTANT_MODEL || "claude-haiku-4-5",
        max_tokens: 900,
        system: sys,
        messages: [{ role: "user", content: `Gate: ${gateState}\nFeatures:\n${JSON.stringify(features, null, 1)}` }],
      }),
      signal: AbortSignal.timeout(25000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text: string = (data?.content ?? []).filter((b: { type?: string }) => b.type === "text").map((b: { text?: string }) => b.text).join("");
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((r: RawRec) => r && typeof r.asset === "string" && r.side === "Long" && typeof r.entry === "number" && typeof r.stop === "number")
      .slice(0, 3);
  } catch {
    return null; // fall back to rules silently — determinism is the floor, not the ceiling
  }
}

export async function POST(req: Request) {
  if (limited(`copilot:${clientIp(req)}`, 6, 5 * 60_000))
    return NextResponse.json({ error: "Too many scans — the market hasn't moved that fast. Try again shortly." }, { status: 429 });

  let body: { symbols?: unknown; gateState?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body." }, { status: 400 }); }

  const symbols = (Array.isArray(body.symbols) ? body.symbols : [])
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim().toUpperCase())
    .slice(0, 8);
  if (symbols.length === 0) return NextResponse.json({ error: "Send symbols: []." }, { status: 400 });
  const gateState = typeof body.gateState === "string" ? body.gateState : "UNKNOWN";

  // Same warm-up as the charts so the numbers the user sees match the numbers we trade on.
  const histories = await Promise.all(symbols.map(async (s) => ({ symbol: s, rows: await fetchDailyHistory(s, WARMUP_BARS) })));
  const withData = histories.filter((h): h is { symbol: string; rows: DailyRow[] } => h.rows !== null && h.rows.length >= 30);
  const features = withData.map((h) => featuresFrom(h.symbol, h.rows));
  const missing = symbols.filter((s) => !withData.some((h) => h.symbol === s));

  let recs: RawRec[] = [];
  let analyst: "ai" | "rules" = "rules";
  const key = process.env.ANTHROPIC_API_KEY;
  if (key && features.length) {
    const ai = await aiAnalyst(features, gateState, key);
    if (ai) {
      // Stamp each AI candidate with the date of the data it actually saw.
      recs = ai.map((r) => ({
        ...r,
        dataAsOf: r.dataAsOf ?? features.find((f) => f.symbol === r.asset?.toUpperCase())?.date ?? null,
      }));
      analyst = "ai";
    }
  }
  if (analyst === "rules") {
    recs = withData
      .map((h) => latestSignal(h.symbol, h.rows))
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .map((s) => ({
        asset: s.symbol, side: "Long" as const, strategy: s.strategy,
        entry: s.entry, stop: s.stop, takeProfits: [s.takeProfit],
        confidence: s.confidence, evidence: s.evidence, technical: s.technical,
        invalidation: s.invalidation, dataAsOf: s.dataAsOf,
      }))
      .slice(0, 3);
  }

  return NextResponse.json({
    analyst,
    features,
    candidates: recs,
    missing,
    citations: ["Stooq daily history (delayed EOD)", analyst === "ai" ? "Claude analyst (advisory only)" : "Deterministic rules analyst"],
    note: "Candidates are unvalidated ideas. The client must run the deterministic validator before anything is approvable.",
  });
}
