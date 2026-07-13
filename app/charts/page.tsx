"use client";

import dynamic from "next/dynamic";
import { useState, useCallback } from "react";
import { Search, TrendingUp, TrendingDown, BarChart2, Activity } from "lucide-react";
import type { ChartMode, Candle } from "@/components/market-chart";

// Load chart only client-side (uses canvas)
const MarketChart = dynamic(() => import("@/components/market-chart"), { ssr: false });

const RANGES = ["1w", "1m", "3m", "6m", "1y", "2y"] as const;
type Range = (typeof RANGES)[number];

const POPULAR = [
  { ticker: "SPY", label: "S&P 500" },
  { ticker: "QQQ", label: "Nasdaq" },
  { ticker: "XAUUSD", label: "Gold" },
  { ticker: "BTCUSD", label: "Bitcoin" },
  { ticker: "ETHUSD", label: "Ethereum" },
  { ticker: "DIA", label: "Dow Jones" },
  { ticker: "IWM", label: "Russell 2k" },
  { ticker: "VIX.US", label: "VIX" },
];

const ALL_INDICATORS = [
  { key: "sma20", label: "SMA 20", color: "#9BACA2" },
  { key: "sma50", label: "SMA 50", color: "#E0A03C" },
  { key: "sma200", label: "SMA 200", color: "#E06B5C" },
  { key: "ema20", label: "EMA 20", color: "#B98FB0" },
  { key: "bb", label: "Bollinger", color: "#6FA8DC" },
  { key: "volume", label: "Volume", color: "#5C6B62" },
  { key: "rsi", label: "RSI 14", color: "#9BACA2" },
  { key: "macd", label: "MACD", color: "#34D399" },
] as const;

const GREEN = "#34D399";
const RED = "#F4645C";

interface Summary {
  close: number; open: number; high: number; low: number;
  chg: number; chgPct: number; hi52: number; lo52: number; date: string; volume?: number | null;
}

const money = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: n < 10 ? 4 : 2 });

export default function ChartsPage() {
  const [ticker, setTicker] = useState("SPY");
  const [input, setInput] = useState("SPY");
  const [range, setRange] = useState<Range>("6m");
  const [mode, setMode] = useState<ChartMode>("pro");
  const [loading, setLoading] = useState(false);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [indicators, setIndicators] = useState({
    sma20: false, sma50: true, sma200: true, ema20: false,
    bb: false, volume: true, rsi: true, macd: false,
  });

  const load = useCallback(async (sym: string, r: Range) => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/chart?symbol=${encodeURIComponent(sym)}&range=${r}`);
      const j = await res.json();
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

  const search = () => { const s = input.trim().toUpperCase(); if (s) load(s, range); };
  const setRangeAndLoad = (r: Range) => { setRange(r); if (ticker) load(ticker, r); };
  const up = summary ? summary.chg >= 0 : true;

  return (
    <div className="grid gap-3">
      {/* Command bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-lg font-bold tracking-tight text-ink">CHARTS</h1>
          <span className="font-mono text-[11px] text-faint">indicator study · delayed EOD unless Alpaca data keys are set</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-[6px] border border-line bg-panel px-3 py-1.5">
            <Search size={14} className="text-faint" />
            <input
              className="w-44 bg-transparent font-mono text-xs text-ink placeholder-faint outline-none"
              placeholder="AAPL, XAUUSD, VUSA.UK…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <button onClick={search} className="btn-primary px-2.5 py-1 text-[11px]">GO</button>
          </div>
          <div className="flex rounded-[6px] border border-line">
            {(["simple", "pro"] as ChartMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="flex items-center gap-1 px-2.5 py-1.5 font-mono text-[11px] uppercase"
                style={mode === m ? { background: "rgb(var(--c-volt))", color: "#0B0F0D" } : { color: "#9BACA2" }}
              >
                {m === "simple" ? <Activity size={12} /> : <BarChart2 size={12} />}{m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Popular tickers */}
      <div className="flex flex-wrap gap-1.5">
        {POPULAR.map((p) => (
          <button
            key={p.ticker}
            onClick={() => { setInput(p.ticker); load(p.ticker, range); }}
            className="rounded-[5px] border border-line bg-panel px-2.5 py-1 font-mono text-[11px] text-mut transition-colors hover:text-ink"
            style={ticker === p.ticker ? { borderColor: "rgb(var(--c-volt))", color: "rgb(var(--c-volt))" } : {}}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Quote header */}
      {summary && (
        <div className="flex flex-wrap items-center gap-4 border border-line bg-panel px-4 py-3">
          <div>
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">{ticker}</div>
            <div className="mt-0.5 font-mono text-2xl font-bold tnum text-ink">{money(summary.close)}</div>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-sm font-semibold tnum" style={{ color: up ? GREEN : RED }}>
            {up ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            {up ? "+" : "−"}{Math.abs(summary.chg).toFixed(2)} ({up ? "+" : "−"}{Math.abs(summary.chgPct).toFixed(2)}%)
          </div>
          <div className="ml-auto flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] tnum">
            {[
              ["O", summary.open], ["H", summary.high], ["L", summary.low], ["52H", summary.hi52], ["52L", summary.lo52],
            ].map(([label, val]) => (
              <div key={label as string} className="text-right">
                <span className="text-faint">{label} </span>
                <span className="text-ink">{money(val as number)}</span>
              </div>
            ))}
            <span className="text-faint">as of {summary.date}</span>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="border border-line bg-panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <div className="flex rounded-[5px] border border-line">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRangeAndLoad(r)}
                className="px-2.5 py-1 font-mono text-[11px] font-semibold uppercase"
                style={range === r ? { background: "rgb(var(--c-volt))", color: "#0B0F0D" } : { color: "#9BACA2" }}
              >
                {r}
              </button>
            ))}
          </div>
          {mode === "pro" && (
            <div className="flex flex-wrap gap-1.5">
              {ALL_INDICATORS.map(({ key, label, color }) => {
                const on = indicators[key as keyof typeof indicators];
                return (
                  <button
                    key={key}
                    onClick={() => setIndicators((p) => ({ ...p, [key]: !p[key as keyof typeof p] }))}
                    className="flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 font-mono text-[10px] transition-all"
                    style={on ? { background: color + "1A", borderColor: color, color } : { borderColor: "rgb(var(--c-line))", color: "rgb(var(--c-faint))" }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? color : "rgb(var(--c-faint))" }} />
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex h-[420px] items-center justify-center font-mono text-xs text-faint">Loading {ticker}…</div>
        ) : error ? (
          <div className="flex h-[420px] flex-col items-center justify-center gap-1 font-mono text-xs" style={{ color: RED }}>
            {error}<span className="text-faint">Try AAPL.US, XAUUSD, BTCUSD, VUSA.UK</span>
          </div>
        ) : candles.length === 0 ? (
          <div className="flex h-[420px] flex-col items-center justify-center gap-3">
            <BarChart2 size={36} className="text-faint" />
            <div className="font-mono text-xs text-mut">Search a symbol to load its chart</div>
          </div>
        ) : (
          <MarketChart candles={candles} mode={mode} indicators={indicators} height={440} />
        )}
      </div>

      {/* Indicator legend (pro) */}
      {mode === "pro" && candles.length > 0 && (
        <div className="grid grid-cols-2 gap-px sm:grid-cols-4">
          {[
            { label: "SMA 20", desc: "20-day average — short-term trend", color: "#9BACA2" },
            { label: "SMA 200", desc: "200-day average — long-term regime (gate check)", color: "#E06B5C" },
            { label: "RSI 14", desc: "Momentum — >70 overbought, <30 oversold", color: "#9BACA2" },
            { label: "MACD", desc: "12/26/9 — trend & momentum divergence", color: "#34D399" },
          ].map((item) => (
            <div key={item.label} className="border border-line bg-panel p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
                <span className="font-mono text-[11px] font-semibold text-ink">{item.label}</span>
              </div>
              <div className="text-[11px] leading-relaxed text-faint">{item.desc}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
