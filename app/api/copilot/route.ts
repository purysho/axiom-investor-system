import { NextResponse } from "next/server";
import { clientIp, limited } from "@/lib/server/ratelimit";
import { mapToStooq, parseStooqDaily, rsi, sma, type DailyRow } from "@/lib/engine/quotes";

export const dynamic = "force-dynamic";

/**
 * POST /api/copilot  { symbols: string[], gateState: string }
 * Feature-engineers each symbol from Stooq daily history, then asks the analyst
 * (Claude if ANTHROPIC_API_KEY is set, deterministic rules otherwise) for candidate
 * recommendations. Returns RAW candidates — the client runs every one through the
 * deterministic validator against live state before anything is shown as approvable.
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

function atr14(rows: DailyRow[]): number | null {
  if (rows.length < 15) return null;
  const trs: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const h = rows[i].high, l = rows[i].low, pc = rows[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const last14 = trs.slice(-14);
  return last14.reduce((a, b) => a + b, 0) / last14.length;
}

async function featuresFor(ticker: string): Promise<Features | null> {
  const stooq = mapToStooq(ticker);
  const d2 = new Date();
  const d1 = new Date(d2.getTime() - 420 * 86400000);
  const fmt = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  try {
    const res = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(stooq)}&i=d&d1=${fmt(d1)}&d2=${fmt(d2)}`, {
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(9000),
      headers: { "User-Agent": "axiom-investor-system/1.0" },
    });
    if (!res.ok) return null;
    const rows = parseStooqDaily(await res.text());
    if (rows.length < 30) return null;
    const closes = rows.map((r) => r.close);
    const last = rows[rows.length - 1];
    const s20 = sma(closes, 20), s50 = sma(closes, 50), s200 = sma(closes, 200);
    const yearHigh = Math.max(...rows.slice(-252).map((r) => r.high));
    const ret20 = closes.length > 21 ? ((last.close / closes[closes.length - 21]) - 1) * 100 : null;
    return {
      symbol: ticker.toUpperCase(),
      close: last.close,
      date: last.date,
      sma20: s20[s20.length - 1],
      sma50: s50[s50.length - 1],
      sma200: s200[s200.length - 1],
      rsi14: rsi(closes, 14),
      atr14: atr14(rows),
      pctFrom52wHigh: yearHigh > 0 ? ((last.close / yearHigh) - 1) * 100 : null,
      ret20dPct: ret20,
    };
  } catch {
    return null;
  }
}

interface RawRec {
  asset: string; side: "Long"; strategy: "Trend pullback" | "Mean reversion";
  entry: number; stop: number; takeProfits: number[];
  confidence: number; evidence: string[]; technical: Record<string, number | string | null>;
}

/** Deterministic analyst — always available, keyless. */
function rulesAnalyst(f: Features): RawRec | null {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const atr = f.atr14 ?? f.close * 0.02;
  // Trend pullback: long-term uptrend, pulled back near the 20-day, momentum not overheated
  if (f.sma200 && f.close > f.sma200 && f.sma20 && f.rsi14 !== null && f.rsi14 >= 38 && f.rsi14 <= 55 && Math.abs(f.close - f.sma20) / f.close < 0.02) {
    const entry = round2(f.close);
    const stop = round2(entry - 2 * atr);
    return {
      asset: f.symbol, side: "Long", strategy: "Trend pullback",
      entry, stop, takeProfits: [round2(entry + 2 * (entry - stop))],
      confidence: 0.55,
      evidence: [
        `Price ${round2(f.close)} is above its 200-day average (${round2(f.sma200)}) — long-term uptrend intact.`,
        `Pulled back to the 20-day average with RSI ${f.rsi14?.toFixed(0)} — resting, not overheated.`,
        `Stop set 2×ATR below entry (ATR14 ≈ ${round2(atr)}).`,
      ],
      technical: { close: f.close, sma20: f.sma20, sma200: f.sma200, rsi14: f.rsi14, atr14: round2(atr) },
    };
  }
  // Mean reversion: uptrend + washed-out RSI
  if (f.sma200 && f.close > f.sma200 && f.rsi14 !== null && f.rsi14 < 32) {
    const entry = round2(f.close);
    const stop = round2(entry - 2.5 * atr);
    return {
      asset: f.symbol, side: "Long", strategy: "Mean reversion",
      entry, stop, takeProfits: [round2(entry + 1.5 * (entry - stop))],
      confidence: 0.5,
      evidence: [
        `RSI ${f.rsi14.toFixed(0)} — short-term washed out while still above the 200-day average.`,
        `Betting on reversion toward the mean, not a new trend; smaller reward target (1.5R).`,
        `Wider 2.5×ATR stop to survive the noise that created the setup.`,
      ],
      technical: { close: f.close, sma200: f.sma200, rsi14: f.rsi14, atr14: round2(atr) },
    };
  }
  return null;
}

async function aiAnalyst(features: Features[], gateState: string, key: string): Promise<RawRec[] | null> {
  const sys = `You are the Copilot analyst inside Axiom Investor System. You receive engineered daily features for a handful of symbols and the current risk-gate state. Propose at most 3 LONG swing candidates as STRICT JSON — an array of objects with keys exactly: asset, side ("Long"), strategy ("Trend pullback" or "Mean reversion"), entry, stop, takeProfits (array of 1-2 numbers), confidence (0-1), evidence (array of 2-4 short plain-English strings citing the supplied numbers), technical (object echoing the key numbers used). Rules: entry = latest close; stop 1.5-3 ATR below entry; only propose when the long-term trend (price vs sma200) supports it; if nothing qualifies return []. No prose, no markdown — JSON only. You do not size positions and you do not execute anything.`;
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

  const features = (await Promise.all(symbols.map(featuresFor))).filter((f): f is Features => f !== null);
  const missing = symbols.filter((s) => !features.some((f) => f.symbol === s));

  let recs: RawRec[] = [];
  let analyst: "ai" | "rules" = "rules";
  const key = process.env.ANTHROPIC_API_KEY;
  if (key && features.length) {
    const ai = await aiAnalyst(features, gateState, key);
    if (ai) { recs = ai; analyst = "ai"; }
  }
  if (analyst === "rules") {
    recs = features.map(rulesAnalyst).filter((r): r is RawRec => r !== null).slice(0, 3);
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
