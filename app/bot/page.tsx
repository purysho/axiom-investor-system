"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bot, Check, FlaskConical, Play, Power, ShieldAlert, X } from "lucide-react";
import { fmtN, fmtPct, fmtUsd, Panel, Stat } from "@/components/chrome";
import { BacktestEquityChart } from "@/components/charts";
import { ProtectionBanner } from "@/components/protection-banner";
import { toast } from "@/components/toast";
import { evaluateGate } from "@/lib/engine/gate";
import { useAppState } from "@/lib/store";
import type { BacktestResult } from "@/lib/engine/backtest";

/* API payload shapes (server types stay server-side; these mirror them). */
interface BotSettings { enabled: boolean; universe: string[]; maxOrdersPerRun: number }
interface BotCheck { name: string; ok: boolean; note: string }
interface BotOrderReport { symbol: string; qty: number; entry: number; stop: number; takeProfit: number | null; clientOrderId: string; status: string; note: string }
interface BotRunReport {
  outcome: "traded" | "stood-down" | "no-signal" | "dry-run" | "error";
  summary: string;
  checks: BotCheck[];
  signals: { symbol: string; strategy: string; entry: number; stop: number; note: string }[];
  orders: BotOrderReport[];
}
interface BotRunRow { id: number; triggerSource: string; startedAt: string; outcome: string; summary: string; detail: Partial<BotRunReport>; ordersPlaced: number }
interface BotStatus {
  settings: BotSettings;
  broker: { broker: string; mode: "paper" | "live"; keyHint: string } | null;
  runs: BotRunRow[];
  cronConfigured: boolean;
}

const OUTCOME_STYLE: Record<string, { color: string; label: string }> = {
  traded: { color: "#34D399", label: "traded" },
  "no-signal": { color: "#93A39A", label: "no signal" },
  "stood-down": { color: "#F0B429", label: "stood down" },
  "dry-run": { color: "#B4F03C", label: "dry run" },
  error: { color: "#F4645C", label: "error" },
  running: { color: "#93A39A", label: "running" },
};

export default function BotPage() {
  const state = useAppState();
  const gate = evaluateGate(state.gateInputs, state.settings, state.trades);

  const [status, setStatus] = useState<BotStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [universeText, setUniverseText] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<null | "dry" | "real">(null);
  const [lastReport, setLastReport] = useState<BotRunReport | null>(null);

  const [btYears, setBtYears] = useState(5);
  const [btRunning, setBtRunning] = useState(false);
  const [bt, setBt] = useState<{ symbols: string[]; missing: string[]; benchmark: string; result: BacktestResult } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/bot");
      if (res.status === 401) { setLoadError("Sign in to use the bot — it runs on the server under your account."); return; }
      if (!res.ok) throw new Error();
      const j = (await res.json()) as BotStatus;
      setStatus(j);
      setUniverseText(j.settings.universe.join(", "));
      setLoadError(null);
    } catch {
      setLoadError("Couldn't load the bot's status.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const ideaSymbols = useMemo(() => {
    const s = new Set<string>();
    for (const r of state.watchRules) s.add(r.ticker.toUpperCase());
    for (const h of state.holdings) if (h.sleeve === "Satellite") s.add(h.ticker.toUpperCase());
    return [...s].slice(0, 8);
  }, [state.watchRules, state.holdings]);

  const parseUniverse = () =>
    [...new Set(universeText.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 8);

  const saveSettings = async (patch: Partial<BotSettings>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/bot", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = await res.json();
      if (!res.ok) { toast(j.error ?? "Couldn't save.", "error"); return false; }
      setStatus((prev) => (prev ? { ...prev, settings: j.settings } : prev));
      return true;
    } catch {
      toast("Couldn't reach the server.", "error");
      return false;
    } finally { setSaving(false); }
  };

  const toggleEnabled = async () => {
    if (!status) return;
    const turningOn = !status.settings.enabled;
    const ok = await saveSettings({ enabled: turningOn, universe: parseUniverse() });
    if (ok) toast(turningOn ? "AXIOM bot is ON — paper only, every interlock still applies." : "Bot switched off.");
  };

  const runNow = async (dryRun: boolean) => {
    setRunning(dryRun ? "dry" : "real");
    setLastReport(null);
    try {
      // Persist any universe edits so the run uses what's on screen.
      await saveSettings({ universe: parseUniverse() });
      const res = await fetch("/api/bot/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const j = await res.json();
      if (!res.ok) { toast(j.error ?? "Run failed.", "error"); return; }
      setLastReport(j.report as BotRunReport);
      toast(j.report.summary, j.report.outcome === "error" ? "error" : j.report.outcome === "traded" ? "success" : "warning");
      void load();
    } catch {
      toast("Couldn't reach the server.", "error");
    } finally { setRunning(null); }
  };

  const runBacktest = async () => {
    const symbols = parseUniverse().length ? parseUniverse() : ideaSymbols;
    if (symbols.length === 0) { toast("Give the bot a universe first — or add tickers to Trade ideas.", "warning"); return; }
    setBtRunning(true);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols,
          years: btYears,
          benchmark: state.settings.benchmarkSymbol.replace(/\.us$/i, "").toUpperCase() || "SPY",
          params: {
            startingEquity: state.settings.portfolioValue,
            riskPerTradePct: state.settings.riskPerTradePct,
            notionalCapPct: state.settings.notionalCapPct,
            heatCapPct: state.settings.heatCapPct,
            maxConcurrent: 3,
          },
        }),
      });
      const j = await res.json();
      if (!res.ok) { toast(j.error ?? "Backtest failed.", "error"); return; }
      setBt(j);
    } catch {
      toast("Couldn't reach the server.", "error");
    } finally { setBtRunning(false); }
  };

  const enabled = status?.settings.enabled ?? false;
  const brokerOk = status?.broker?.mode === "paper";
  const gateClosed = gate.state === "NO NEW SWINGS";
  const m = bt?.result.metrics;

  return (
    <div className="grid gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">AXIOM Bot</h1>
          <p className="mt-1 max-w-xl text-sm text-mut">
            The autopilot. It scans with the same strategy engine you can backtest below, sizes with your risk
            engine, and submits <span className="text-ink">paper bracket orders only</span> — behind every
            interlock the Copilot has: gate, protections, kill switch, preflight, daily caps.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge bg-panel2 text-mut">Autopilot · paper only</span>
          {status && (
            <button type="button" onClick={() => void toggleEnabled()} disabled={saving || (!enabled && !brokerOk)} className={enabled ? "btn-danger" : "btn-primary"}>
              <Power size={14} />
              {enabled ? "Turn bot OFF" : "Turn bot ON"}
            </button>
          )}
        </div>
      </div>

      {/* Gate banner — same interlock the bot itself enforces server-side */}
      <div
        className="flex items-center gap-3 rounded-lg border px-4 py-3"
        style={{ borderColor: gateClosed ? "#F4645C" : "#232B26", background: gateClosed ? "#241111" : "#121714" }}
      >
        <ShieldAlert size={18} style={{ color: gateClosed ? "#F4645C" : gate.state === "REDUCED RISK ONLY" ? "#F0B429" : "#34D399" }} />
        <div className="flex-1 text-sm">
          <span className="font-semibold">{gate.state}</span>
          <span className="text-mut"> — {gateClosed ? "the bot will stand down on its next run." : gate.state === "REDUCED RISK ONLY" ? "the bot trades half size and records an exception." : "the bot may open new paper risk within your caps."}</span>
        </div>
        <Link href="/gate" className="btn-ghost text-xs">Risk check →</Link>
      </div>

      <ProtectionBanner />

      {loadError && (
        <Panel title="Bot unavailable">
          <p className="text-sm text-mut">{loadError} <Link href="/login" className="underline">Sign in →</Link></p>
        </Panel>
      )}

      {status && (
        <>
          {/* Setup */}
          <Panel
            eyebrow={status.broker ? `broker: ${status.broker.broker} · ${status.broker.mode} · …${status.broker.keyHint}` : "no broker connected"}
            title="Universe and cadence"
            right={
              <div className="flex gap-2">
                <button type="button" className="btn" onClick={() => void runNow(true)} disabled={running !== null}>
                  <FlaskConical size={14} />{running === "dry" ? "Previewing…" : "Dry run"}
                </button>
                <button type="button" className="btn-primary" onClick={() => void runNow(false)} disabled={running !== null || !enabled}>
                  <Play size={14} />{running === "real" ? "Running…" : "Run now"}
                </button>
              </div>
            }
          >
            <div className="grid gap-3">
              <label className="grid gap-1.5 text-xs text-mut">
                Symbols the bot scans (max 8). Leave empty to use your Trade ideas{ideaSymbols.length ? ` (currently: ${ideaSymbols.join(", ")})` : ""}.
                <input
                  className="field font-mono"
                  value={universeText}
                  onChange={(e) => setUniverseText(e.target.value)}
                  onBlur={() => { if (status.settings.universe.join(", ") !== parseUniverse().join(", ")) void saveSettings({ universe: parseUniverse() }); }}
                  placeholder="e.g. SPY, AAPL, MSFT"
                />
              </label>
              <div className="flex flex-wrap items-center gap-4 text-xs text-mut">
                <label className="flex items-center gap-2">
                  Max orders per run
                  <select
                    className="field w-20"
                    value={status.settings.maxOrdersPerRun}
                    onChange={(e) => void saveSettings({ maxOrdersPerRun: Number(e.target.value) })}
                  >
                    <option value={1}>1</option><option value={2}>2</option><option value={3}>3</option>
                  </select>
                </label>
                <span>
                  Schedule: {status.cronConfigured
                    ? "this deployment has a cron token — the bot also runs on the server's schedule."
                    : "no cron token set — the bot only runs when you press Run now. See BOT.md to schedule it."}
                </span>
              </div>
              {!brokerOk && (
                <p className="text-xs" style={{ color: "#F0B429" }}>
                  {status.broker
                    ? "Your broker connection is LIVE. The bot refuses live accounts — reconnect in paper mode to enable it."
                    : "Connect an Alpaca paper account in Settings to enable the bot."}
                  {" "}<Link href="/settings" className="underline">Settings →</Link>
                </p>
              )}
            </div>
          </Panel>

          {/* Last run report */}
          {lastReport && (
            <Panel eyebrow={`outcome: ${lastReport.outcome}`} title="What the bot just did">
              <div className="grid gap-3">
                <p className="text-sm text-ink">{lastReport.summary}</p>
                <ul className="grid gap-1 font-mono text-xs text-mut sm:grid-cols-2">
                  {lastReport.checks.map((c) => (
                    <li key={c.name} className="flex items-start gap-2">
                      {c.ok ? <Check size={13} style={{ color: "#34D399" }} className="mt-0.5 shrink-0" /> : <X size={13} style={{ color: "#F4645C" }} className="mt-0.5 shrink-0" />}
                      <span><span className="text-ink">{c.name}</span> — {c.note}</span>
                    </li>
                  ))}
                </ul>
                {lastReport.signals.length > 0 && (
                  <ul className="grid gap-1 font-mono text-xs text-mut">
                    {lastReport.signals.map((s, i) => (
                      <li key={i}>{s.symbol} · {s.strategy} · entry {s.entry || "—"} stop {s.stop || "—"} · {s.note}</li>
                    ))}
                  </ul>
                )}
                {lastReport.orders.length > 0 && (
                  <ul className="grid gap-1 font-mono text-xs">
                    {lastReport.orders.map((o, i) => (
                      <li key={i} className="text-mut">
                        <span className="text-ink">{o.symbol}</span> — {o.status === "dry-run" ? "would buy" : "buy"} {o.qty} @ ~{o.entry}, stop {o.stop}{o.takeProfit ? `, target ${o.takeProfit}` : ""} · <span style={{ color: o.status === "blocked" || o.status === "failed" ? "#F4645C" : "#34D399" }}>{o.status}</span> · {o.note}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>
          )}

          {/* Run history */}
          <Panel eyebrow="every run is logged — especially the ones that did nothing" title="Run history">
            {status.runs.length === 0 ? (
              <p className="text-sm text-mut">No runs yet. Try a dry run — it walks every interlock and reports what would happen without submitting anything.</p>
            ) : (
              <ul className="grid gap-2">
                {status.runs.map((r) => {
                  const st = OUTCOME_STYLE[r.outcome] ?? OUTCOME_STYLE.running;
                  return (
                    <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                      <span className="font-mono text-faint">{new Date(r.startedAt).toLocaleString()}</span>
                      <span className="badge" style={{ color: st.color, background: `${st.color}1A` }}>{st.label}</span>
                      <span className="badge bg-panel2 text-faint">{r.triggerSource}</span>
                      <span className="min-w-0 flex-1 text-mut">{r.summary}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </>
      )}

      {/* Backtest */}
      <Panel
        eyebrow="the same code the bot trades — replayed over history"
        title="Backtest the strategy"
        right={
          <div className="flex items-center gap-2">
            <select className="field w-28" value={btYears} onChange={(e) => setBtYears(Number(e.target.value))}>
              <option value={3}>3 years</option><option value={5}>5 years</option><option value={10}>10 years</option>
            </select>
            <button type="button" className="btn-primary" onClick={() => void runBacktest()} disabled={btRunning}>
              <Bot size={14} />{btRunning ? "Replaying…" : "Run backtest"}
            </button>
          </div>
        }
      >
        <p className="text-xs leading-relaxed text-mut">
          Replays the entry rules over daily history with your actual risk settings ({state.settings.riskPerTradePct}% per trade,
          {" "}{state.settings.heatCapPct}% heat cap, {state.settings.notionalCapPct}% single-name cap). Fills are conservative:
          signals fill at the next open, a bar that touches both stop and target counts as a stop, gaps fill at the open, and
          slippage is charged both ways. Past results are evidence for the process, not a promise of returns.
        </p>

        {bt && m && (
          <div className="mt-4 grid gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Total return" value={fmtPct(m.totalReturnPct)} tone={m.totalReturnPct >= 0 ? "good" : "bad"} sub={m.benchmarkReturnPct !== null ? `${bt.benchmark} buy-hold: ${fmtPct(m.benchmarkReturnPct)}` : undefined} />
              <Stat label="CAGR" value={m.cagrPct !== null ? fmtPct(m.cagrPct) : "—"} />
              <Stat label="Max drawdown" value={`−${fmtPct(m.maxDrawdownPct)}`} tone="bad" />
              <Stat label="Exposure" value={fmtPct(m.exposurePct)} sub="days with a position" />
              <Stat label="Trades" value={String(m.trades)} sub={`${m.wins}W / ${m.losses}L`} />
              <Stat label="Win rate" value={m.winRatePct !== null ? fmtPct(m.winRatePct) : "—"} />
              <Stat label="Expectancy" value={m.expectancyR !== null ? `${m.expectancyR >= 0 ? "+" : ""}${fmtN(m.expectancyR)}R` : "—"} tone={m.expectancyR !== null && m.expectancyR >= 0 ? "good" : "bad"} />
              <Stat label="Profit factor" value={m.profitFactor !== null ? fmtN(m.profitFactor) : "—"} />
            </div>

            <BacktestEquityChart curve={bt.result.equityCurve} startingEquity={bt.result.params.startingEquity} />

            <p className="font-mono text-[11px] text-faint">
              {m.startDate} → {m.endDate} · {bt.symbols.join(", ")}{bt.missing.length ? ` · no data: ${bt.missing.join(", ")}` : ""} ·
              skipped entries — benchmark filter {bt.result.skipped.benchmark}, heat cap {bt.result.skipped.heat}, concurrency {bt.result.skipped.concurrency}, sizing {bt.result.skipped.size}, gapped stops {bt.result.skipped.gapThroughStop}
            </p>
            {bt.result.warnings.map((w, i) => <p key={i} className="text-xs" style={{ color: "#F0B429" }}>{w}</p>)}

            {bt.result.trades.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead>
                    <tr className="text-faint">
                      <th className="pb-1 pr-3 font-normal">symbol</th>
                      <th className="pb-1 pr-3 font-normal">strategy</th>
                      <th className="pb-1 pr-3 font-normal">entry</th>
                      <th className="pb-1 pr-3 font-normal">exit</th>
                      <th className="pb-1 pr-3 font-normal">why</th>
                      <th className="pb-1 pr-3 font-normal">held</th>
                      <th className="pb-1 pr-3 font-normal text-right">P&L</th>
                      <th className="pb-1 font-normal text-right">R</th>
                    </tr>
                  </thead>
                  <tbody className="text-mut">
                    {bt.result.trades.slice(-15).reverse().map((t, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="py-1 pr-3 text-ink">{t.symbol}</td>
                        <td className="py-1 pr-3">{t.strategy}</td>
                        <td className="py-1 pr-3">{t.entryDate} @ {t.entryPrice}</td>
                        <td className="py-1 pr-3">{t.exitDate} @ {t.exitPrice}</td>
                        <td className="py-1 pr-3">{t.exitReason}</td>
                        <td className="py-1 pr-3">{t.holdBars}d</td>
                        <td className="py-1 pr-3 text-right" style={{ color: t.pl >= 0 ? "#34D399" : "#F4645C" }}>{fmtUsd(t.pl)}</td>
                        <td className="py-1 text-right" style={{ color: t.rMultiple >= 0 ? "#34D399" : "#F4645C" }}>{t.rMultiple >= 0 ? "+" : ""}{t.rMultiple.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1 text-[10px] text-faint">Most recent 15 of {m.trades} trades.</p>
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* Ground rules */}
      <div className="flex items-start gap-3 rounded-lg border border-dashed border-line bg-panel px-4 py-3.5">
        <Bot size={16} className="mt-0.5 shrink-0 text-faint" />
        <div className="text-sm text-mut">
          <span className="font-semibold text-ink">Ground rules, permanently.</span> The bot trades paper accounts
          only — a live connection stands it down, and that is code, not a setting. Every order passes the gate,
          your behavioural protections, deterministic sizing, and a live-account preflight. Your kill switch stops
          everything. Earn live trading the stated way: 20+ paper trades, positive expectancy, no heat-cap breaches —
          and even then it stays human-approved, order by order.
        </div>
      </div>
    </div>
  );
}
