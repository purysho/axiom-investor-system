import type { DailyRow } from "./quotes";
import type { BacktestParams } from "./backtest";

/**
 * Builds a SINGLE self-contained Python file — pure standard library, no
 * numpy/pandas, no network — that a person or any AI with a code sandbox can
 * run (`python3 file.py`) to REPRODUCE AXIOM's backtest from scratch. It
 * embeds the exact OHLC data used and a faithful port of the strategy and
 * backtester, then prints the same metrics and trades.
 *
 * This is the artifact for "give it to a series of AIs and compare what they
 * get": unlike the Markdown report (which an AI can only evaluate), this one
 * an AI can actually execute. The port is validated against the canonical
 * TypeScript engine trade-for-trade (see tests) so it is not a divergent
 * reimplementation.
 */

export interface ReproInput {
  symbols: string[];
  benchmark: string;
  params: BacktestParams;
  series: Record<string, DailyRow[]>;
  benchmarkRows: DailyRow[] | null;
  dataSource: string;
  generatedAt: string;
}

/** Full-precision CSV so Python parses byte-identical IEEE-754 doubles. */
function toCsv(series: Record<string, DailyRow[]>, benchmark: string, benchmarkRows: DailyRow[] | null): string {
  const lines = ["symbol,date,open,high,low,close,volume"];
  const push = (sym: string, rows: DailyRow[]) => {
    for (const r of rows) lines.push(`${sym},${r.date},${r.open},${r.high},${r.low},${r.close},${r.volume}`);
  };
  for (const [sym, rows] of Object.entries(series)) push(sym, rows);
  if (benchmarkRows && !series[benchmark]) push(benchmark, benchmarkRows);
  return lines.join("\n");
}

export function buildReproPython(input: ReproInput): string {
  const { params: p } = input;
  const csv = toCsv(input.series, input.benchmark, input.benchmarkRows);
  const py = String.raw;
  return py`#!/usr/bin/env python3
# AXIOM strategy — REPRODUCIBLE backtest (pure Python standard library).
#
# Generated ${input.generatedAt} from the AXIOM investor system.
# Data source: ${input.dataSource}
#
# WHAT THIS IS
#   A self-contained, runnable reimplementation of AXIOM's long-only swing
#   strategy and its deterministic backtester, with the exact daily OHLC data
#   embedded below. Run it to reproduce the numbers independently:
#
#       python3 ${"axiom_backtest.py"}
#
#   It needs only Python 3.8+ (no numpy, no pandas, no internet). This port is
#   validated against AXIOM's canonical TypeScript engine trade-for-trade; the
#   canonical source is lib/engine/strategy.ts and lib/engine/backtest.ts.
#
# FOR AN AI REVIEWER
#   Run it and report the metrics. Then critique: is the logic sound, is the
#   sample large enough to mean anything, what are the failure modes, and is
#   the risk framework adequate? Past results do not predict future returns;
#   this is a transparency artifact, not a solicitation.
import csv, io, math, sys, json as _json

SYMBOLS   = ${JSON.stringify(input.symbols)}
BENCHMARK = ${JSON.stringify(input.benchmark)}
PARAMS = {
    "startingEquity": ${p.startingEquity},
    "riskPerTradePct": ${p.riskPerTradePct},
    "notionalCapPct": ${p.notionalCapPct},
    "heatCapPct": ${p.heatCapPct},
    "maxConcurrent": ${p.maxConcurrent},
    "timeStopBars": ${p.timeStopBars},
    "slippageBps": ${p.slippageBps},
    "strategies": ${JSON.stringify(p.strategies)},
    "benchmarkFilter": ${p.benchmarkFilter ? "True" : "False"},
    "perSymbolCooldownBars": ${p.perSymbolCooldownBars},
    "requireEntryConfirmation": ${p.requireEntryConfirmation ? "True" : "False"},
}
FIRST_TRADABLE_BAR = 260  # indicator warm-up (matches WARMUP_BARS)

def round2(n):  # replicate JS Math.round(n*100)/100 (half up toward +inf)
    return math.floor(n * 100 + 0.5) / 100

# ── Indicators (match lib/engine/strategy.ts) ────────────────────────────────
def sma_series(closes, period):
    out = [None] * len(closes); s = 0.0
    for i, c in enumerate(closes):
        s += c
        if i >= period: s -= closes[i - period]
        if i >= period - 1: out[i] = s / period
    return out

def rsi_series(closes, period=14):
    out = [None] * len(closes)
    if len(closes) < period + 1: return out
    avg_gain = avg_loss = 0.0
    for i in range(1, period + 1):
        d = closes[i] - closes[i - 1]
        if d >= 0: avg_gain += d
        else: avg_loss -= d
    avg_gain /= period; avg_loss /= period
    def value():
        if avg_loss == 0: return 50.0 if avg_gain == 0 else 100.0
        return 100 - 100 / (1 + avg_gain / avg_loss)
    out[period] = value()
    for i in range(period + 1, len(closes)):
        d = closes[i] - closes[i - 1]
        avg_gain = (avg_gain * (period - 1) + max(d, 0)) / period
        avg_loss = (avg_loss * (period - 1) + max(-d, 0)) / period
        out[i] = value()
    return out

def atr_series(bars, period=14):
    out = [None] * len(bars); trs = []; s = 0.0
    for i in range(1, len(bars)):
        tr = max(bars[i]["high"] - bars[i]["low"],
                 abs(bars[i]["high"] - bars[i - 1]["close"]),
                 abs(bars[i]["low"] - bars[i - 1]["close"]))
        trs.append(tr); s += tr
        if len(trs) > period: s -= trs[len(trs) - 1 - period]
        if len(trs) >= period: out[i] = s / period
    return out

def indicators(bars):
    closes = [b["close"] for b in bars]
    return {"sma20": sma_series(closes, 20), "sma200": sma_series(closes, 200),
            "rsi14": rsi_series(closes, 14), "atr14": atr_series(bars, 14)}

# ── Entry rules (match signalAt) ─────────────────────────────────────────────
def signal_at(bars, ind, i, strategies, confirm):
    if i < 0 or i >= len(bars): return None
    close = bars[i]["close"]; sma20 = ind["sma20"][i]; sma200 = ind["sma200"][i]
    rsi14 = ind["rsi14"][i]; atr = ind["atr14"][i] if ind["atr14"][i] is not None else close * 0.02
    b = bars[i]; rng = b["high"] - b["low"]
    confirmed = b["close"] > b["open"] and (rng <= 0 or (b["close"] - b["low"]) >= 0.5 * rng)
    if confirm and not confirmed: return None
    if ("trend-pullback" in strategies and sma200 is not None and close > sma200
            and sma20 is not None and rsi14 is not None and 38 <= rsi14 <= 55
            and abs(close - sma20) / close < 0.02):
        entry = round2(close); stop = round2(entry - 2 * atr)
        if stop <= 0: return None
        return {"strategy": "Trend pullback", "entry": entry, "stop": stop,
                "target": round2(entry + 2 * (entry - stop))}
    if ("mean-reversion" in strategies and sma200 is not None and close > sma200
            and rsi14 is not None and rsi14 < 32):
        entry = round2(close); stop = round2(entry - 2.5 * atr)
        if stop <= 0: return None
        return {"strategy": "Mean reversion", "entry": entry, "stop": stop,
                "target": round2(entry + 1.5 * (entry - stop))}
    return None

# ── Position sizing (match computeSizing) ────────────────────────────────────
def sized_qty(equity, entry, stop):
    risk_dollars = equity * PARAMS["riskPerTradePct"] / 100
    per_share = abs(entry - stop)
    if entry <= 0 or per_share <= 0: return 0
    max_by_risk = math.floor(risk_dollars / per_share)
    cap = math.floor(equity * PARAMS["notionalCapPct"] / 100 / entry)
    return min(max_by_risk, cap)

# ── Backtest (match runBacktest) ─────────────────────────────────────────────
def run(series, benchmark_rows):
    p = PARAMS
    skipped = {"benchmark": 0, "heat": 0, "concurrency": 0, "size": 0, "gapThroughStop": 0, "cooldown": 0}
    last_stop = {}
    symbols = [s for s in series if len(series.get(s, [])) > 0]
    usable = [s for s in symbols if len(series[s]) >= FIRST_TRADABLE_BAR + 2]
    ind = {s: indicators(series[s]) for s in usable}
    didx = {s: {b["date"]: i for i, b in enumerate(series[s])} for s in usable}

    bench_above = None
    if p["benchmarkFilter"] and benchmark_rows and len(benchmark_rows) > 200:
        bi = indicators(benchmark_rows)
        bench_above = {r["date"]: (bi["sma200"][i] is not None and r["close"] > bi["sma200"][i])
                       for i, r in enumerate(benchmark_rows)}

    dates = sorted(set(d for s in usable for d in (b["date"] for b in series[s][FIRST_TRADABLE_BAR:])))
    slip = p["slippageBps"] / 10000
    cash = equity = float(p["startingEquity"])
    open_pos = {}; pending = {}; closed = []; curve = []; days_exposed = 0

    def open_risk():
        return sum((o["entry"] - o["stop"]) * o["qty"] for o in open_pos.values())

    def close_pos(o, date, raw, reason):
        nonlocal cash
        exit_px = raw * (1 - slip); cash += o["qty"] * exit_px
        psr = o["entry"] - o["stop"]
        closed.append({"symbol": o["symbol"], "strategy": o["strategy"], "entryDate": o["entryDate"],
                       "entryPrice": round2(o["entry"]), "exitDate": date, "exitPrice": round2(exit_px),
                       "exitReason": reason, "pl": round2((exit_px - o["entry"]) * o["qty"]),
                       "rMultiple": round2((exit_px - o["entry"]) / psr) if psr > 0 else 0,
                       "holdBars": o["holdBars"]})
        del open_pos[o["symbol"]]

    for date in dates:
        for sym in list(pending):
            pe = pending[sym]; rows = series[sym]; idx = didx[sym].get(date)
            if idx is None: continue
            del pending[sym]
            if idx != pe["fillIndex"]: continue
            bar = rows[idx]; fill = bar["open"] * (1 + slip)
            if fill <= pe["stop"]: skipped["gapThroughStop"] += 1; continue
            if len(open_pos) >= p["maxConcurrent"]: skipped["concurrency"] += 1; continue
            qty = sized_qty(equity, fill, pe["stop"])
            if qty < 1: skipped["size"] += 1; continue
            new_risk = (fill - pe["stop"]) * qty
            if open_risk() + new_risk > p["heatCapPct"] / 100 * equity: skipped["heat"] += 1; continue
            if qty * fill > cash: skipped["size"] += 1; continue
            cash -= qty * fill
            open_pos[sym] = {"symbol": sym, "strategy": pe["strategy"], "entryDate": date,
                             "entry": fill, "qty": qty, "stop": pe["stop"], "target": pe["target"],
                             "holdBars": 0, "lastClose": bar["close"]}

        for o in list(open_pos.values()):
            idx = didx[o["symbol"]].get(date)
            if idx is None: continue
            bar = series[o["symbol"]][idx]; o["lastClose"] = bar["close"]
            if bar["date"] > o["entryDate"]: o["holdBars"] += 1
            if bar["open"] <= o["stop"]: close_pos(o, date, bar["open"], "stop"); last_stop[o["symbol"]] = idx
            elif bar["low"] <= o["stop"]: close_pos(o, date, o["stop"], "stop"); last_stop[o["symbol"]] = idx
            elif bar["open"] >= o["target"]: close_pos(o, date, bar["open"], "target")
            elif bar["high"] >= o["target"]: close_pos(o, date, o["target"], "target")
            elif p["timeStopBars"] > 0 and o["holdBars"] >= p["timeStopBars"]: close_pos(o, date, bar["close"], "time")

        for sym in usable:
            idx = didx[sym].get(date)
            if idx is None or idx < FIRST_TRADABLE_BAR or idx >= len(series[sym]) - 1: continue
            if sym in open_pos or sym in pending: continue
            if len(open_pos) + len(pending) >= p["maxConcurrent"]: continue
            if p["perSymbolCooldownBars"] > 0:
                st = last_stop.get(sym)
                if st is not None and idx - st < p["perSymbolCooldownBars"]: skipped["cooldown"] += 1; continue
            sig = signal_at(series[sym], ind[sym], idx, p["strategies"], p["requireEntryConfirmation"])
            if not sig: continue
            if bench_above is not None and bench_above.get(date) is not True: skipped["benchmark"] += 1; continue
            pending[sym] = {"strategy": sig["strategy"], "stop": sig["stop"], "target": sig["target"], "fillIndex": idx + 1}

        mv = sum(o["qty"] * o["lastClose"] for o in open_pos.values())
        equity = cash + mv
        if open_pos: days_exposed += 1
        curve.append((date, round2(equity)))

    for o in list(open_pos.values()):
        rows = series[o["symbol"]]
        close_pos(o, rows[-1]["date"], rows[-1]["close"], "end")

    return closed, curve, days_exposed, skipped

def metrics(trades, curve, days_exposed, benchmark_rows):
    if not curve: return {}
    final = curve[-1][1]; start_eq = float(PARAMS["startingEquity"])
    total = (final / start_eq - 1) * 100
    sd, ed = curve[0][0], curve[-1][0]
    from datetime import date as _d
    def days(x): y, m, dd = map(int, x.split("-")); return _d(y, m, dd).toordinal()
    years = (days(ed) - days(sd)) / 365.25
    cagr = ((final / start_eq) ** (1 / years) - 1) * 100 if years > 0.25 and final > 0 else None
    peak = -1e18; mdd = 0.0
    for _, e in curve:
        peak = max(peak, e)
        if peak > 0: mdd = max(mdd, (peak - e) / peak)
    wins = [t for t in trades if t["pl"] > 0]; losses = [t for t in trades if t["pl"] < 0]
    gw = sum(t["pl"] for t in wins); gl = abs(sum(t["pl"] for t in losses))
    bench = None
    if benchmark_rows and len(benchmark_rows) > 1:
        win = [r for r in benchmark_rows if sd <= r["date"] <= ed]
        if len(win) > 1: bench = round2((win[-1]["close"] / win[0]["close"] - 1) * 100)
    return {"totalReturnPct": round2(total), "cagrPct": round2(cagr) if cagr is not None else None,
            "maxDrawdownPct": round2(mdd * 100), "trades": len(trades), "wins": len(wins), "losses": len(losses),
            "winRatePct": round2(len(wins) / len(trades) * 100) if trades else None,
            "expectancyR": round2(sum(t["rMultiple"] for t in trades) / len(trades)) if trades else None,
            "profitFactor": round2(gw / gl) if gl > 0 else None,
            "exposurePct": round2(days_exposed / len(curve) * 100), "benchmarkReturnPct": bench,
            "startDate": sd, "endDate": ed}

def load():
    series = {}
    for row in csv.DictReader(io.StringIO(DATA)):
        series.setdefault(row["symbol"], []).append({
            "date": row["date"], "open": float(row["open"]), "high": float(row["high"]),
            "low": float(row["low"]), "close": float(row["close"]), "volume": float(row["volume"])})
    for s in series: series[s].sort(key=lambda r: r["date"])
    return series

# ── Embedded daily OHLC data (symbol,date,open,high,low,close,volume) ─────────
DATA = """${csv}
"""

if __name__ == "__main__":
    series = load()
    bench_rows = series.get(BENCHMARK)
    universe = {s: series[s] for s in series if s in SYMBOLS}
    trades, curve, exposed, skipped = run(universe, bench_rows)
    m = metrics(trades, curve, exposed, bench_rows)
    if "--json" in sys.argv:  # machine-readable, for automated verification
        print(_json.dumps({"metrics": m, "skipped": skipped, "trades": [
            {"symbol": t["symbol"], "entryDate": t["entryDate"], "exitDate": t["exitDate"],
             "exitReason": t["exitReason"], "rMultiple": t["rMultiple"], "pl": t["pl"]} for t in trades]}))
        sys.exit(0)
    print("AXIOM reproduced backtest")
    print("=" * 40)
    for k in ["startDate", "endDate", "trades", "wins", "losses", "winRatePct",
              "totalReturnPct", "cagrPct", "maxDrawdownPct", "expectancyR",
              "profitFactor", "exposurePct", "benchmarkReturnPct"]:
        print(f"{k:>18}: {m.get(k)}")
    print("refused entries:", skipped)
    print("-" * 40)
    print(f"{'symbol':>8} {'strategy':>14} {'entry_date':>11} {'exit_date':>11} {'reason':>8} {'R':>7}")
    for t in trades[-40:]:
        print(f"{t['symbol']:>8} {t['strategy']:>14} {t['entryDate']:>11} {t['exitDate']:>11} {t['exitReason']:>8} {t['rMultiple']:>7.2f}")
`;
}
