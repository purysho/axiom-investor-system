"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { usePolling } from "@/lib/use-polling";
import type { ChartMode, Candle } from "@/components/market-chart";

const MarketChart = dynamic(() => import("@/components/market-chart"), { ssr: false });

/**
 * The trading terminal: a dense, dark market screen — quote header, chart with
 * timeframe tabs, a stat-cell grid, and a live market monitor. Real data via
 * /api/chart and /api/quotes (delayed EOD, or real when Alpaca keys are set).
 * This is the "traditional trading screen" surface; the rest of AXIOM stays
 * process-first.
 */

const RANGES = ["1w", "1m", "3m", "6m", "1y", "2y"] as const;
type Range = (typeof RANGES)[number];

const MONITOR: Array<{ sym: string; label: string }> = [
  { sym: "SPY", label: "S&P 500" },
  { sym: "QQQ", label: "Nasdaq 100" },
  { sym: "DIA", label: "Dow Jones" },
  { sym: "IWM", label: "Russell 2000" },
  { sym: "TLT", label: "20Y Treasuries" },
  { sym: "GLD", label: "Gold" },
  { sym: "BTCUSD", label: "Bitcoin" },
  { sym: "ETHUSD", label: "Ethereum" },
];

const GREEN = "#34D399";
const RED = "#F4645C";
const AMBER = "#F0B429";

interface Summary {
  close: number; open: number; high: number; low: number;
  chg: number; chgPct: number; hi52: number; lo52: number; date: string; volume?: number | null;
}
interface MonitorQuote {
  ticker: string; close: number | null;
  metrics?: { pct_change: number | null; volume_x_avg: number | null; pct_from_52w_high: number | null; rsi: number | null };
}
interface Position { symbol: string; qty: number; avgEntryPrice: number; marketValue: number | null; unrealizedPl: number | null }
interface LivePayload { connected: boolean; mode?: string; positions?: Position[]; summary?: { equity: number; cash: number; unrealizedPl: number | null } }
interface OrderRow { symbol: string; side: string; qty: number; status: string; filledAvgPrice: number | null; submittedAt: string }

const money = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: n < 10 ? 4 : 2 });
const compact = (n: number | null | undefined) =>
  n == null ? "—" : Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n);

function Cell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="border border-line bg-panel px-3 py-2">
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">{label}</div>
      <div className="mt-0.5 font-mono text-[13px] tnum" style={{ color: color ?? "#EFF6F1" }}>{value}</div>
    </div>
  );
}

export default function TerminalPage() {
  const [ticker, setTicker] = useState("SPY");
  const [input, setInput] = useState("SPY");
  const [range, setRange] = useState<Range>("6m");
  const [mode, setMode] = useState<ChartMode>("pro");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [monitor, setMonitor] = useState<Record<string, MonitorQuote>>({});
  const [live, setLive] = useState<LivePayload | null>(null);
  const [orders, setOrders] = useState<OrderRow[] | null>(null);

  const load = useCallback(async (sym: string, r: Range) => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/chart?symbol=${encodeURIComponent(sym)}&range=${r}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "No data");
      setCandles(j.candles ?? []);
      setSummary(j.summary ?? null);
      setTicker(sym.toUpperCase());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setCandles([]); setSummary(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load("SPY", "6m"); }, [load]);

  const refreshMonitor = useCallback(async () => {
    try {
      const res = await fetch(`/api/quotes?mode=metrics&symbols=${MONITOR.map((m) => m.sym).join(",")}`);
      if (!res.ok) return;
      const j = (await res.json()) as { quotes?: MonitorQuote[] };
      const map: Record<string, MonitorQuote> = {};
      for (const q of j.quotes ?? []) map[q.ticker.toUpperCase()] = q;
      setMonitor(map);
    } catch { /* keep last */ }
  }, []);
  usePolling(refreshMonitor, 90_000);

  const refreshAccount = useCallback(async () => {
    try {
      const [pRes, oRes] = await Promise.all([fetch("/api/broker/positions"), fetch("/api/broker/orders")]);
      if (pRes.ok) setLive((await pRes.json()) as LivePayload);
      if (oRes.ok) { const j = (await oRes.json()) as { orders: OrderRow[] }; setOrders(j.orders); }
    } catch { /* keep last */ }
  }, []);
  usePolling(refreshAccount, 60_000);

  const search = () => { const s = input.trim().toUpperCase(); if (s) load(s, range); };
  const up = summary ? summary.chg >= 0 : true;
  const indicators = { sma20: false, sma50: true, sma200: true, ema20: false, bb: false, volume: true, rsi: true, macd: false };

  return (
    <div className="grid gap-3">
      {/* Command bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-lg font-bold tracking-tight text-ink">TERMINAL</h1>
          <span className="font-mono text-[11px] text-faint">real-time market dashboard · delayed EOD unless Alpaca data keys are set</span>
        </div>
        <div className="flex items-center gap-2 rounded-[6px] border border-line bg-panel px-3 py-1.5">
          <Search size={14} className="text-faint" />
          <input
            className="w-40 bg-transparent font-mono text-xs text-ink placeholder-faint outline-none"
            placeholder="SYMBOL (AAPL, BTCUSD…)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <button onClick={search} className="btn-primary px-2.5 py-1 text-[11px]">GO</button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        {/* Main: quote + chart + stat cells */}
        <div className="grid gap-3">
          {/* Quote header */}
          <div className="flex flex-wrap items-end justify-between gap-4 border border-line bg-panel px-4 py-3">
            <div>
              <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">{ticker}</div>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="font-mono text-3xl font-bold tnum text-ink">{summary ? money(summary.close) : "—"}</span>
                {summary && (
                  <span className="font-mono text-sm font-semibold tnum" style={{ color: up ? GREEN : RED }}>
                    {up ? "▲" : "▼"} {Math.abs(summary.chg).toFixed(2)} ({up ? "+" : "−"}{Math.abs(summary.chgPct).toFixed(2)}%)
                  </span>
                )}
              </div>
            </div>
            <div className="flex rounded-[6px] border border-line">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => { setRange(r); load(ticker, r); }}
                  className="px-2.5 py-1 font-mono text-[11px] font-semibold uppercase transition-colors"
                  style={range === r ? { background: "#B4F03C", color: "#0B0F0D" } : { color: "#9BACA2" }}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Chart */}
          <div className="border border-line bg-panel">
            <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">Price · SMA50 · SMA200 · RSI · Volume</span>
              <div className="flex rounded-[5px] border border-line">
                {(["simple", "pro"] as ChartMode[]).map((m) => (
                  <button key={m} onClick={() => setMode(m)}
                    className="px-2 py-0.5 font-mono text-[10px] uppercase"
                    style={mode === m ? { background: "#B4F03C", color: "#0B0F0D" } : { color: "#9BACA2" }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>
            {loading ? (
              <div className="flex h-[360px] items-center justify-center font-mono text-xs text-faint">Loading {ticker}…</div>
            ) : error ? (
              <div className="flex h-[360px] flex-col items-center justify-center gap-1 font-mono text-xs" style={{ color: RED }}>
                {error}<span className="text-faint">Try AAPL, SPY, BTCUSD, XAUUSD, VUSA.UK</span>
              </div>
            ) : candles.length > 0 ? (
              <MarketChart candles={candles} mode={mode} indicators={indicators} height={360} />
            ) : (
              <div className="flex h-[360px] items-center justify-center font-mono text-xs text-faint">No data.</div>
            )}
          </div>

          {/* Stat cells */}
          {summary && (
            <div className="grid grid-cols-2 gap-px sm:grid-cols-4">
              <Cell label="Open" value={money(summary.open)} />
              <Cell label="Day High" value={money(summary.high)} color={GREEN} />
              <Cell label="Day Low" value={money(summary.low)} color={RED} />
              <Cell label="Volume" value={compact(summary.volume)} />
              <Cell label="52W High" value={money(summary.hi52)} />
              <Cell label="52W Low" value={money(summary.lo52)} />
              <Cell label="From 52W High" value={`${(((summary.close - summary.hi52) / summary.hi52) * 100).toFixed(1)}%`} color={AMBER} />
              <Cell label="As Of" value={summary.date} />
            </div>
          )}
        </div>

        {/* Market monitor */}
        <div className="border border-line bg-panel">
          <div className="border-b border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            Market Monitor
          </div>
          <table className="w-full font-mono text-[11px] tnum">
            <thead>
              <tr className="text-faint">
                <th className="px-3 py-1 text-left font-normal">Sym</th>
                <th className="px-2 py-1 text-right font-normal">Last</th>
                <th className="px-2 py-1 text-right font-normal">Chg%</th>
                <th className="px-3 py-1 text-right font-normal">RSI</th>
              </tr>
            </thead>
            <tbody>
              {MONITOR.map((mrow) => {
                const q = monitor[mrow.sym.toUpperCase()];
                const chg = q?.metrics?.pct_change ?? null;
                const rsi = q?.metrics?.rsi ?? null;
                const active = ticker === mrow.sym.toUpperCase();
                return (
                  <tr
                    key={mrow.sym}
                    onClick={() => { setInput(mrow.sym); load(mrow.sym, range); }}
                    className="cursor-pointer border-t border-line transition-colors hover:bg-panel2"
                    style={active ? { background: "rgba(180,240,60,0.08)" } : undefined}
                  >
                    <td className="px-3 py-1.5">
                      <span className="text-ink">{mrow.sym.replace("USD", "")}</span>
                      <span className="ml-1 text-[9px] text-faint">{mrow.label}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right text-ink">{money(q?.close)}</td>
                    <td className="px-2 py-1.5 text-right" style={{ color: chg == null ? "#9BACA2" : chg >= 0 ? GREEN : RED }}>
                      {chg == null ? "—" : `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}`}
                    </td>
                    <td className="px-3 py-1.5 text-right" style={{ color: rsi == null ? "#9BACA2" : rsi >= 70 ? RED : rsi <= 30 ? GREEN : "#9BACA2" }}>
                      {rsi == null ? "—" : rsi.toFixed(0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t border-line px-3 py-2 font-mono text-[9px] leading-relaxed text-faint">
            Click a row to load it. RSI red ≥70 (overbought), green ≤30 (oversold). Delayed EOD; verify before acting.
          </div>
        </div>
      </div>

      {/* Workstation row: live positions + order blotter */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* Positions */}
        <div className="border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">Positions</span>
            {live?.connected && live.summary && (
              <span className="font-mono text-[10px] tnum text-faint">
                EQ {money(live.summary.equity)} · U/PL{" "}
                <span style={{ color: (live.summary.unrealizedPl ?? 0) >= 0 ? GREEN : RED }}>
                  {live.summary.unrealizedPl == null ? "—" : `${live.summary.unrealizedPl >= 0 ? "+" : ""}${money(live.summary.unrealizedPl)}`}
                </span>
              </span>
            )}
          </div>
          {!live?.connected ? (
            <div className="px-3 py-4 font-mono text-[11px] text-faint">
              No broker connected. Connect the built-in simulator or Alpaca in <a href="/settings" className="underline">Settings</a> to see live positions here.
            </div>
          ) : (live.positions ?? []).filter((p) => p.qty !== 0).length === 0 ? (
            <div className="px-3 py-4 font-mono text-[11px] text-faint">Flat — no open positions.</div>
          ) : (
            <table className="w-full font-mono text-[11px] tnum">
              <thead>
                <tr className="text-faint">
                  <th className="px-3 py-1 text-left font-normal">Sym</th>
                  <th className="px-2 py-1 text-right font-normal">Qty</th>
                  <th className="px-2 py-1 text-right font-normal">Avg</th>
                  <th className="px-2 py-1 text-right font-normal">Value</th>
                  <th className="px-3 py-1 text-right font-normal">U/PL</th>
                </tr>
              </thead>
              <tbody>
                {(live.positions ?? []).filter((p) => p.qty !== 0).map((p) => (
                  <tr key={p.symbol} className="border-t border-line">
                    <td className="px-3 py-1.5 text-ink">{p.symbol}</td>
                    <td className="px-2 py-1.5 text-right">{p.qty}</td>
                    <td className="px-2 py-1.5 text-right">{money(p.avgEntryPrice)}</td>
                    <td className="px-2 py-1.5 text-right">{money(p.marketValue)}</td>
                    <td className="px-3 py-1.5 text-right" style={{ color: (p.unrealizedPl ?? 0) >= 0 ? GREEN : RED }}>
                      {p.unrealizedPl == null ? "—" : `${p.unrealizedPl >= 0 ? "+" : ""}${money(p.unrealizedPl)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Order blotter */}
        <div className="border border-line bg-panel">
          <div className="border-b border-line px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            Order Blotter
          </div>
          {!orders || orders.length === 0 ? (
            <div className="px-3 py-4 font-mono text-[11px] text-faint">
              No orders yet. The Copilot and the AXIOM Bot record every order here.
            </div>
          ) : (
            <table className="w-full font-mono text-[11px] tnum">
              <thead>
                <tr className="text-faint">
                  <th className="px-3 py-1 text-left font-normal">Time</th>
                  <th className="px-2 py-1 text-left font-normal">Sym</th>
                  <th className="px-2 py-1 text-left font-normal">Side</th>
                  <th className="px-2 py-1 text-right font-normal">Qty</th>
                  <th className="px-2 py-1 text-right font-normal">Fill</th>
                  <th className="px-3 py-1 text-left font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 12).map((o, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="px-3 py-1.5 text-faint">{new Date(o.submittedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-2 py-1.5 text-ink">{o.symbol}</td>
                    <td className="px-2 py-1.5" style={{ color: o.side === "buy" ? GREEN : RED }}>{o.side}</td>
                    <td className="px-2 py-1.5 text-right">{o.qty}</td>
                    <td className="px-2 py-1.5 text-right">{o.filledAvgPrice == null ? "—" : money(o.filledAvgPrice)}</td>
                    <td className="px-3 py-1.5" style={{ color: o.status === "filled" ? GREEN : o.status === "rejected" ? RED : "#9BACA2" }}>{o.status.replace("_", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
