"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bot, Lock, Power, RefreshCw, ShieldAlert } from "lucide-react";
import { Panel } from "@/components/chrome";
import { toast } from "@/components/toast";
import { validateRecommendation } from "@/lib/copilot/validate";
import type { Recommendation } from "@/lib/copilot/types";
import { evaluateGate } from "@/lib/engine/gate";
import { getState, todayKey, uid, update, useAppState } from "@/lib/store";
import type { Trade } from "@/lib/engine/types";

interface ApiCandidate {
  asset: string; side: "Long"; strategy: Recommendation["strategy"];
  entry: number; stop: number; takeProfits: number[];
  confidence: number; evidence: string[]; technical: Record<string, number | string | null>;
}

export default function CopilotPage() {
  const state = useAppState();
  const gate = evaluateGate(state.gateInputs, state.settings, state.trades);
  const [scanning, setScanning] = useState(false);
  const [analyst, setAnalyst] = useState<"ai" | "rules" | null>(null);

  const live = useMemo(
    () =>
      state.recommendations
        .filter((r) => r.status === "proposed" && new Date(r.expiry).getTime() > Date.now())
        .sort((a, b) => b.confidence - a.confidence),
    [state.recommendations],
  );
  const blocked = state.recommendations.filter((r) => r.status === "rejected").slice(-3).reverse();
  const history = state.recommendations.filter((r) => r.status === "approved").slice(-5).reverse();

  const symbols = useMemo(() => {
    const s = new Set<string>();
    for (const r of state.watchRules) s.add(r.ticker.toUpperCase());
    for (const h of state.holdings) if (h.sleeve === "Satellite") s.add(h.ticker.toUpperCase());
    return [...s].slice(0, 8);
  }, [state.watchRules, state.holdings]);

  const scan = async () => {
    if (state.copilot.killSwitch) { toast("Kill switch is on — turn it off to scan.", "warning"); return; }
    if (symbols.length === 0) { toast("Add tickers to Trade ideas first — the copilot scans those.", "warning"); return; }
    setScanning(true);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbols, gateState: gate.state }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Scan failed");
      setAnalyst(j.analyst);
      const now = new Date();
      const expiry = new Date(now.getTime() + 3 * 86400000).toISOString();
      const fresh: Recommendation[] = (j.candidates as ApiCandidate[]).map((c) => ({
        id: uid("R"),
        createdAt: now.toISOString(),
        expiry,
        status: "proposed",
        asset: c.asset,
        market: /USD$/.test(c.asset) ? (/^(BTC|ETH|SOL|XRP|ADA|DOGE)/.test(c.asset) ? "Crypto" : "Metal") : "Equity",
        timeframe: "Daily",
        side: c.side,
        strategy: c.strategy,
        entry: c.entry,
        stop: c.stop,
        takeProfits: c.takeProfits ?? [],
        positionSize: null,
        maxRiskUsd: null,
        confidence: Math.max(0, Math.min(1, c.confidence ?? 0.5)),
        evidence: (c.evidence ?? []).slice(0, 4),
        technical: c.technical ?? {},
        macro: { gateState: gate.state },
        sentiment: null,
        citations: j.citations ?? [],
        source: j.analyst,
        validation: { ok: false, notes: [] },
      }));
      // Validate against LIVE state; dedupe per asset per day
      const current = getState();
      const validated = fresh.map((r) => validateRecommendation(r, current));
      update((prev) => {
        const today = todayKey();
        const keep = prev.recommendations.filter(
          (r) => !(r.status === "proposed" && r.createdAt.slice(0, 10) === today && validated.some((v) => v.asset === r.asset)),
        );
        return { ...prev, recommendations: [...keep, ...validated].slice(-60), copilot: { ...prev.copilot, lastScanAt: now.toISOString() } };
      });
      const ok = validated.filter((v) => v.status === "proposed").length;
      const rej = validated.length - ok;
      toast(validated.length === 0 ? "Scan complete — nothing qualified today." : `Scan complete — ${ok} idea${ok === 1 ? "" : "s"}${rej ? `, ${rej} blocked by the risk engine` : ""}.`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Scan failed.", "error");
    } finally {
      setScanning(false);
    }
  };

  const approve = (rec: Recommendation) => {
    // Re-validate at the moment of approval — state may have moved
    const fresh = validateRecommendation(rec, getState());
    if (!fresh.validation.ok || fresh.entry === null || fresh.stop === null || !fresh.positionSize) {
      update((prev) => ({ ...prev, recommendations: prev.recommendations.map((r) => (r.id === rec.id ? { ...fresh, id: rec.id } : r)) }));
      toast(fresh.validation.notes[0] ?? "No longer valid.", "error");
      return;
    }
    const exception = fresh.macro.gateState === "REDUCED RISK ONLY";
    const t: Trade = {
      id: uid("T"),
      status: "Open",
      gateAtEntry: fresh.macro.gateState as Trade["gateAtEntry"],
      strategy: fresh.strategy === "Mean reversion" ? "Mean Reversion" : "Pullback",
      ticker: fresh.asset,
      direction: fresh.side,
      sleeve: "Satellite",
      entryDate: todayKey(),
      exitDate: "",
      entry: fresh.entry,
      stop: fresh.stop,
      target: fresh.takeProfits[0] ?? null,
      shares: fresh.positionSize,
      exitPrice: null, fees: null, mfePct: null, maePct: null,
      thesisGrade: "", emotion: null, ruleFollowed: "", exitReason: "", mistakeTag: "",
      thesis: `Copilot (${fresh.source}): ${fresh.evidence[0] ?? fresh.strategy}`,
      lesson: "", nextRuleChange: "",
      tags: "copilot;paper",
      exceptionNote: exception ? "Copilot approval under REDUCED RISK ONLY (half size)." : undefined,
    };
    update((prev) => ({
      ...prev,
      trades: [...prev.trades, t],
      recommendations: prev.recommendations.map((r) => (r.id === rec.id ? { ...fresh, id: rec.id, status: "approved", executedTradeId: t.id } : r)),
    }));
    toast(`Paper order recorded — ${t.ticker} ${t.shares} @ ${t.entry}, stop ${t.stop}. It's in your journal.`);
  };

  const dismiss = (id: string) =>
    update((prev) => ({ ...prev, recommendations: prev.recommendations.map((r) => (r.id === id ? { ...r, status: "dismissed" } : r)) }));

  const toggleKill = () =>
    update((prev) => ({ ...prev, copilot: { ...prev.copilot, killSwitch: !prev.copilot.killSwitch } }));

  const gateClosed = gate.state === "NO NEW SWINGS";

  return (
    <div className="grid gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Copilot</h1>
          <p className="mt-1 max-w-xl text-sm text-mut">
            Scans your trade-idea tickers, proposes paper trades with evidence, and sizes them with your risk
            engine. It never executes anything — you approve each one, and approvals are <span className="text-ink">paper only</span> for now.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge bg-panel2 text-mut">Co-pilot · paper</span>
          <button type="button" onClick={toggleKill} className={state.copilot.killSwitch ? "btn-danger" : "btn"}>
            <Power size={14} />
            {state.copilot.killSwitch ? "Kill switch ON" : "Kill switch"}
          </button>
        </div>
      </div>

      {/* Gate interlock banner */}
      <div
        className="flex items-center gap-3 rounded-lg border px-4 py-3"
        style={{ borderColor: gateClosed ? "#F4645C" : "#232B26", background: gateClosed ? "#241111" : "#121714" }}
      >
        <ShieldAlert size={18} style={{ color: gateClosed ? "#F4645C" : gate.state === "REDUCED RISK ONLY" ? "#F0B429" : "#34D399" }} />
        <div className="flex-1 text-sm">
          <span className="font-semibold">{gate.state}</span>
          <span className="text-mut">
            {" "}
            — {gateClosed ? "the copilot is locked out of new risk today. Manage what you hold." : gate.state === "REDUCED RISK ONLY" ? "half size; every approval records a documented exception." : "new paper risk permitted within your caps."}
          </span>
        </div>
        <Link href="/gate" className="btn-ghost text-xs">Risk check →</Link>
      </div>

      {/* Scan */}
      <Panel
        eyebrow={symbols.length ? `scanning ${symbols.length}: ${symbols.join(", ")}` : "no tickers yet"}
        title="Find today's candidates"
        right={
          <button type="button" className="btn-primary" onClick={() => void scan()} disabled={scanning || gateClosed || state.copilot.killSwitch}>
            <RefreshCw size={14} className={scanning ? "animate-spin" : ""} />
            {scanning ? "Scanning…" : "Scan"}
          </button>
        }
      >
        <p className="text-xs leading-relaxed text-mut">
          The universe is your <Link href="/watchlist" className="underline">Trade ideas</Link> list plus satellite
          holdings (max 8). Analyst: {analyst === "ai" ? "Claude, advisory only" : analyst === "rules" ? "deterministic rules" : "Claude when a key is set, deterministic rules otherwise"} — either
          way, only the deterministic risk engine sizes and permits anything. Data is delayed EOD.
          {state.copilot.lastScanAt && <span className="text-faint"> Last scan {new Date(state.copilot.lastScanAt).toLocaleString()}.</span>}
        </p>
      </Panel>

      {/* Proposal cards */}
      {live.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {live.map((r) => (
            <div key={r.id} className="panel flex flex-col gap-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-display text-lg font-bold">{r.asset}</div>
                  <span className="badge mt-1 bg-panel2 text-volt" style={{ color: "#B4F03C", background: "rgba(180,240,60,0.10)" }}>{r.strategy}</span>
                </div>
                <div className="text-right">
                  <div className="eyebrow">confidence</div>
                  <div className="font-display text-lg font-bold" style={{ color: "#B4F03C" }}>{Math.round(r.confidence * 100)}%</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-lg bg-panel2 p-3 font-mono text-xs">
                <div><div className="text-faint">Entry</div><div className="text-ink">{r.entry}</div></div>
                <div><div className="text-faint">Stop</div><div style={{ color: "#F4645C" }}>{r.stop}</div></div>
                <div><div className="text-faint">Target</div><div style={{ color: "#34D399" }}>{r.takeProfits[0] ?? "—"}</div></div>
                <div><div className="text-faint">Size</div><div className="text-ink">{r.positionSize ?? "—"}</div></div>
                <div><div className="text-faint">Risk (1R)</div><div className="text-ink">${r.maxRiskUsd ?? "—"}</div></div>
                <div><div className="text-faint">Expires</div><div className="text-mut">{new Date(r.expiry).toLocaleDateString()}</div></div>
              </div>

              <ul className="grid gap-1.5 text-xs leading-relaxed text-mut">
                {r.evidence.map((e, i) => (
                  <li key={i} className="flex gap-2"><span style={{ color: "#B4F03C" }}>·</span><span>{e}</span></li>
                ))}
              </ul>
              {r.validation.notes.length > 0 && (
                <p className="text-[11px] text-faint">{r.validation.notes.join(" ")}</p>
              )}

              <div className="mt-auto flex gap-2">
                <button type="button" className="btn-primary flex-1" onClick={() => approve(r)}>
                  Approve paper trade
                </button>
                <button type="button" className="btn" onClick={() => dismiss(r.id)}>Dismiss</button>
              </div>
              <p className="text-[10px] text-faint">
                {r.source === "ai" ? "AI-proposed" : "Rules-proposed"} · sized by your risk engine · {r.citations[0] ?? ""} · not advice
              </p>
            </div>
          ))}
        </div>
      )}

      {live.length === 0 && (
        <Panel title="No live proposals">
          <p className="text-sm text-mut">
            {gateClosed
              ? "The gate is closed to new risk, so the copilot stands down — that's the system working."
              : "Run a scan. If nothing qualifies, nothing is proposed; most days that's the right answer."}
          </p>
        </Panel>
      )}

      {/* Blocked + history */}
      {blocked.length > 0 && (
        <Panel eyebrow="what the risk engine refused" title="Recently blocked">
          <ul className="grid gap-2 text-xs text-mut">
            {blocked.map((r) => (
              <li key={r.id}><span className="font-semibold text-ink">{r.asset}</span> — {r.validation.notes[0]}</li>
            ))}
          </ul>
        </Panel>
      )}
      {history.length > 0 && (
        <Panel eyebrow="paper positions live in your journal" title="Approved by you">
          <ul className="grid gap-1.5 font-mono text-xs text-mut">
            {history.map((r) => (
              <li key={r.id}>{r.asset} · {r.positionSize} @ {r.entry} · stop {r.stop} · <Link href="/journal" className="underline">journal →</Link></li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Autopilot locked */}
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-line bg-panel px-4 py-3.5">
        <Lock size={16} className="text-faint" />
        <div className="flex-1 text-sm text-mut">
          <span className="font-semibold text-ink">Autopilot — locked.</span> Unlocks after the paper co-pilot
          earns it: 20+ approved paper trades with positive expectancy and no heat-cap breaches. Even then, the
          deterministic engine executes; the AI only ever proposes.
        </div>
        <Bot size={16} className="text-faint" />
      </div>
    </div>
  );
}
