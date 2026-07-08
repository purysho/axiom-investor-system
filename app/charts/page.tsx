"use client";

import dynamic from "next/dynamic";
import { useState, useCallback } from "react";
import { Search, TrendingUp, TrendingDown, BarChart2, Activity } from "lucide-react";
import { Panel } from "@/components/chrome";
import type { ChartMode } from "@/components/market-chart";
import type { Candle } from "@/components/market-chart";

// Load chart only client-side (uses canvas)
const MarketChart = dynamic(() => import("@/components/market-chart"), { ssr: false });

const RANGES = ["1w", "1m", "3m", "6m", "1y", "2y"] as const;
type Range = typeof RANGES[number];

const POPULAR = [
  { ticker: "SPY",    label: "S&P 500" },
  { ticker: "QQQ",   label: "Nasdaq" },
  { ticker: "XAUUSD",label: "Gold" },
  { ticker: "BTCUSD",label: "Bitcoin" },
  { ticker: "ETHUSD",label: "Ethereum" },
  { ticker: "DIA",   label: "Dow Jones" },
  { ticker: "IWM",   label: "Russell 2k" },
  { ticker: "VIX.US",label: "VIX" },
];

const ALL_INDICATORS = [
  { key: "sma20",  label: "SMA 20",  color: "#93A39A" },
  { key: "sma50",  label: "SMA 50",  color: "#A8732F" },
  { key: "sma200", label: "SMA 200", color: "#A84D45" },
  { key: "ema20",  label: "EMA 20",  color: "#8C6F87" },
  { key: "bb",     label: "Bollinger Bands", color: "#979D96" },
  { key: "volume", label: "Volume",  color: "#DED7CA" },
  { key: "rsi",    label: "RSI 14",  color: "#93A39A" },
  { key: "macd",   label: "MACD",    color: "#2F6B52" },
] as const;

interface Summary {
  close: number; open: number; high: number; low: number;
  chg: number; chgPct: number; hi52: number; lo52: number; date: string; volume?: number | null;
}

export default function ChartsPage() {
  const [ticker, setTicker]     = useState("SPY");
  const [input, setInput]       = useState("SPY");
  const [range, setRange]       = useState<Range>("6m");
  const [mode, setMode]         = useState<ChartMode>("simple");
  const [loading, setLoading]   = useState(false);
  const [candles, setCandles]   = useState<Candle[]>([]);
  const [summary, setSummary]   = useState<Summary | null>(null);
  const [error, setError]       = useState("");
  const [indicators, setIndicators] = useState({
    sma20: false, sma50: true, sma200: true, ema20: false,
    bb: false, volume: true, rsi: true, macd: false,
  });

  const load = useCallback(async (sym: string, r: Range) => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/chart?symbol=${encodeURIComponent(sym)}&range=${r}`);
      const j   = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      setCandles(j.candles ?? []);
      setSummary(j.summary ?? null);
      setTicker(sym.toUpperCase());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chart data");
      setCandles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const search = () => {
    const s = input.trim().toUpperCase();
    if (s) load(s, range);
  };

  const setRangeAndLoad = (r: Range) => {
    setRange(r);
    if (ticker) load(ticker, r);
  };

  const up = summary && summary.chg >= 0;

  return (
    <div className="grid gap-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink">Charts</h1>
        <p className="text-sm text-mut mt-1">Delayed EOD data via Stooq. For research only — verify before acting.</p>
      </div>

      {/* Search + mode */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search bar */}
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2.5 shadow-sm min-w-64">
          <Search size={16} className="text-faint shrink-0" />
          <input
            className="flex-1 bg-transparent text-sm text-ink placeholder-faint outline-none"
            placeholder="AAPL, XAUUSD, BTCUSD, VUSA.UK…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <button onClick={search} className="btn-primary px-3 py-1.5 text-xs">Go</button>
        </div>

        {/* Simple / Pro toggle */}
        <div className="flex rounded-xl border border-line bg-panel overflow-hidden shadow-sm">
          {(["simple", "pro"] as ChartMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all"
              style={mode === m ? { background: "var(--gate)", color: "white" } : { color: "#93A39A" }}
            >
              {m === "simple" ? <Activity size={14} /> : <BarChart2 size={14} />}
              {m === "simple" ? "Simple" : "Pro"}
            </button>
          ))}
        </div>
      </div>

      {/* Popular tickers */}
      <div className="flex flex-wrap gap-2">
        {POPULAR.map((p) => (
          <button
            key={p.ticker}
            onClick={() => { setInput(p.ticker); load(p.ticker, range); }}
            className="rounded-lg border border-line bg-panel px-3 py-1.5 text-xs font-medium text-mut shadow-sm transition-all hover:text-ink hover:border-faint"
            style={ticker === p.ticker ? { borderColor: "var(--gate)", color: "var(--gate)", background: "var(--gate-bg)" } : {}}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Price summary */}
      {summary && (
        <Panel noPad>
          <div className="flex flex-wrap items-center gap-4 px-5 py-4">
            <div>
              <div className="text-xs text-faint font-semibold uppercase tracking-wide">{ticker}</div>
              <div className="text-3xl font-bold text-ink mt-0.5">${summary.close.toLocaleString()}</div>
            </div>
            <div className={`flex items-center gap-1.5 text-lg font-semibold`} style={{ color: up ? "#2F6B52" : "#A84D45" }}>
              {up ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
              {up ? "+" : "−"}{Math.abs(summary.chg).toFixed(2)} ({up ? "+" : "−"}{Math.abs(summary.chgPct).toFixed(2)}%)
            </div>
            <div className="flex flex-wrap gap-4 ml-auto">
              {[
                { label: "Open",   val: summary.open },
                { label: "High",   val: summary.high },
                { label: "Low",    val: summary.low },
                { label: "52W High", val: summary.hi52 },
                { label: "52W Low",  val: summary.lo52 },
              ].map(({ label, val }) => (
                <div key={label} className="text-right">
                  <div className="text-[10px] text-faint font-semibold uppercase">{label}</div>
                  <div className="text-sm font-semibold text-ink">${val.toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div className="text-xs text-faint ml-auto">as of {summary.date}</div>
          </div>
        </Panel>
      )}

      {/* Chart */}
      <Panel noPad>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          {/* Range */}
          <div className="flex rounded-lg border border-line overflow-hidden">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRangeAndLoad(r)}
                className="px-3 py-1.5 text-xs font-medium transition-colors"
                style={range === r ? { background: "var(--gate)", color: "white" } : { color: "#93A39A" }}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Indicators — only shown in Pro mode */}
          {mode === "pro" && (
            <div className="flex flex-wrap gap-2 ml-2">
              {ALL_INDICATORS.map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => setIndicators((p) => ({ ...p, [key]: !p[key as keyof typeof p] }))}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-all"
                  style={
                    indicators[key as keyof typeof indicators]
                      ? { background: color + "18", borderColor: color, color }
                      : { borderColor: "#DED7CA", color: "#979D96" }
                  }
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: indicators[key as keyof typeof indicators] ? color : "#3A453E" }}
                  />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Chart area */}
        {loading ? (
          <div className="flex h-80 items-center justify-center">
            <div className="text-sm text-faint">Loading chart data…</div>
          </div>
        ) : error ? (
          <div className="flex h-80 flex-col items-center justify-center gap-2">
            <div className="text-sm" style={{ color: "#A84D45" }}>{error}</div>
            <p className="text-xs text-faint">Try a Stooq-format symbol: AAPL.US, XAUUSD, BTCUSD, VUSA.UK</p>
          </div>
        ) : candles.length === 0 ? (
          <div className="flex h-80 flex-col items-center justify-center gap-3">
            <BarChart2 size={40} className="text-faint" />
            <div className="text-sm font-medium text-mut">Search for a symbol to see its chart</div>
            <div className="flex flex-wrap justify-center gap-2">
              {POPULAR.slice(0, 4).map((p) => (
                <button
                  key={p.ticker}
                  onClick={() => { setInput(p.ticker); load(p.ticker, range); }}
                  className="rounded-full border border-line bg-panel2 px-3 py-1 text-xs text-mut hover:text-ink transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <MarketChart candles={candles} mode={mode} indicators={indicators} height={420} />
        )}
      </Panel>

      {/* Explanation */}
      {mode === "pro" && candles.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "SMA 20", desc: "20-day average — short-term trend", color: "#93A39A" },
            { label: "SMA 200", desc: "200-day average — long-term regime (gate check)", color: "#A84D45" },
            { label: "RSI 14", desc: "Momentum — above 70 overbought, below 30 oversold", color: "#93A39A" },
            { label: "MACD", desc: "12/26/9 — trend & momentum divergence", color: "#2F6B52" },
          ].map((item) => (
            <div key={item.label} className="panel p-4">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
                <div className="text-xs font-semibold text-ink">{item.label}</div>
              </div>
              <div className="text-xs text-faint leading-relaxed">{item.desc}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
