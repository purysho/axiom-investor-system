"use client";

import { useState } from "react";
import { fmtN, fmtPct, fmtUsd, Panel, Stat } from "@/components/chrome";
import { evaluateGate } from "@/lib/engine/gate";
import { computeSizing } from "@/lib/engine/sizing";
import { update, useAppState } from "@/lib/store";

const numOrNull = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export default function GatePage() {
  const state = useAppState();
  const gate = evaluateGate(state.gateInputs, state.settings, state.trades);
  const { gateInputs: gi, settings } = state;
  const [fetching, setFetching] = useState(false);
  const [fetchNote, setFetchNote] = useState("");

  const [entry, setEntry] = useState("50");
  const [stop, setStop] = useState("47.50");
  const [target, setTarget] = useState("55");
  const sizing = computeSizing({
    portfolioValue: settings.portfolioValue,
    riskPerTradePct: settings.riskPerTradePct,
    entry: numOrNull(entry),
    stop: numOrNull(stop),
    target: numOrNull(target),
    notionalCapPct: settings.notionalCapPct,
  });

  const setGi = (patch: Partial<typeof gi>) =>
    update((prev) => ({ ...prev, gateInputs: { ...prev.gateInputs, ...patch } }));
  const setThreshold = (key: keyof typeof settings.thresholds, v: number) =>
    update((prev) => ({
      ...prev,
      settings: { ...prev.settings, thresholds: { ...prev.settings.thresholds, [key]: v } },
    }));
  const setSetting = (key: "portfolioValue" | "riskPerTradePct" | "notionalCapPct" | "heatCapPct", v: number) =>
    update((prev) => ({ ...prev, settings: { ...prev.settings, [key]: v } }));

  const fetchLatest = async () => {
    setFetching(true);
    setFetchNote("");
    try {
      const res = await fetch(`/api/market?benchmark=${encodeURIComponent(settings.benchmarkSymbol)}`);
      const data = await res.json();
      const patch: Partial<typeof gi> = {
        asOf: new Date().toLocaleString(),
        source: "FRED + Stooq (delayed)",
      };
      if (data.vix) patch.vix = data.vix.value;
      if (data.nfci) patch.nfci = data.nfci.value;
      if (data.benchmark) {
        patch.benchClose = data.benchmark.close ?? null;
        patch.benchSma200 = data.benchmark.sma200 ?? null;
        if (data.benchmark.aboveSma200 !== null && data.benchmark.aboveSma200 !== undefined)
          patch.benchAbove200dma = data.benchmark.aboveSma200;
      }
      setGi(patch);
      const missing = [!data.vix && "VIX", !data.nfci && "NFCI", !data.benchmark && "benchmark"].filter(Boolean);
      setFetchNote(
        missing.length
          ? `Fetched with gaps — ${missing.join(", ")} unavailable; enter manually.`
          : "Fetched. Delayed EOD data — verify before acting.",
      );
    } catch {
      setFetchNote("Fetch failed — enter values manually. Unknown inputs count as failed checks.");
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="grid gap-3">
      <Panel
        eyebrow="Risk permission before candidate discovery"
        title={`Gate state: ${gate.state}`}
        right={
          <button type="button" className="btn-gate" onClick={fetchLatest} disabled={fetching}>
            {fetching ? "Fetching…" : "Fetch latest data"}
          </button>
        }
      >
        <table className="w-full text-left">
          <thead>
            <tr className="eyebrow">
              <th className="cell font-normal">Check</th>
              <th className="cell font-normal">Current</th>
              <th className="cell hidden font-normal sm:table-cell">Condition</th>
              <th className="cell font-normal">Result</th>
              <th className="cell hidden font-normal md:table-cell">Source</th>
            </tr>
          </thead>
          <tbody>
            {gate.checks.map((c) => (
              <tr key={c.id}>
                <td className="cell">{c.label}</td>
                <td className="cell text-mut">{c.current}</td>
                <td className="cell hidden text-mut sm:table-cell">{c.threshold}</td>
                <td className="cell font-semibold" style={{ color: c.pass ? "#2FBF8F" : c.unknown ? "#7E8C99" : "#E5484D" }}>
                  {c.pass ? "PASS" : c.unknown ? "AWAITING" : "FAIL"}
                </td>
                <td className="cell hidden text-faint md:table-cell">{c.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {fetchNote && <p className="mt-2 font-mono text-[11px] text-mut">{fetchNote}</p>}
        <p className="mt-2 text-[11px] text-faint">
          0 fails → risk allowed · 1 fail → reduced risk only (document the exception) · 2+ fails → no new
          swings, manage existing positions only. Unknown inputs count as fails until data arrives.
        </p>
      </Panel>

      <div className="grid gap-3 md:grid-cols-2">
        <Panel eyebrow="Manual inputs" title="Gate inputs">
          <div className="grid gap-2">
            <label className="grid gap-1 text-xs text-mut">
              Benchmark close vs 200-day MA
              <select
                className="field"
                value={gi.benchAbove200dma === null ? "" : gi.benchAbove200dma ? "yes" : "no"}
                onChange={(e) =>
                  setGi({ benchAbove200dma: e.target.value === "" ? null : e.target.value === "yes" })
                }
              >
                <option value="">Unknown</option>
                <option value="yes">Above</option>
                <option value="no">Below</option>
              </select>
            </label>
            {gi.benchClose !== null && gi.benchClose !== undefined && (
              <p className="font-mono text-[11px] text-faint">
                {settings.benchmarkSymbol}: close {fmtN(gi.benchClose)} vs 200-DMA {fmtN(gi.benchSma200 ?? null)}
              </p>
            )}
            <label className="grid gap-1 text-xs text-mut">
              VIX
              <input className="field" inputMode="decimal" value={gi.vix ?? ""} onChange={(e) => setGi({ vix: numOrNull(e.target.value) })} />
            </label>
            <label className="grid gap-1 text-xs text-mut">
              NFCI (positive = tighter conditions)
              <input className="field" inputMode="decimal" value={gi.nfci ?? ""} onChange={(e) => setGi({ nfci: numOrNull(e.target.value) })} />
            </label>
            <label className="grid gap-1 text-xs text-mut">
              Drawdown from high-water mark (%) — negative number, 0 = at highs
              <input className="field" inputMode="decimal" value={gi.drawdownPct ?? ""} onChange={(e) => setGi({ drawdownPct: numOrNull(e.target.value) })} />
            </label>
            <label className="grid gap-1 text-xs text-mut">
              Unaccepted binary-event risk present?
              <select
                className="field"
                value={gi.binaryEventRisk === null ? "" : gi.binaryEventRisk ? "yes" : "no"}
                onChange={(e) => setGi({ binaryEventRisk: e.target.value === "" ? null : e.target.value === "yes" })}
              >
                <option value="">Unknown</option>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </label>
          </div>
        </Panel>

        <Panel eyebrow="Governance defaults — review monthly, never intraday" title="Thresholds & profile">
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs text-mut">
              VIX ceiling
              <input className="field" inputMode="decimal" value={settings.thresholds.vixMax} onChange={(e) => setThreshold("vixMax", Number(e.target.value) || 0)} />
            </label>
            <label className="grid gap-1 text-xs text-mut">
              NFCI ceiling
              <input className="field" inputMode="decimal" value={settings.thresholds.nfciMax} onChange={(e) => setThreshold("nfciMax", Number(e.target.value) || 0)} />
            </label>
            <label className="grid gap-1 text-xs text-mut">
              Max drawdown (%)
              <input className="field" inputMode="decimal" value={settings.thresholds.maxDrawdownPct} onChange={(e) => setThreshold("maxDrawdownPct", Number(e.target.value) || 0)} />
            </label>
            <label className="grid gap-1 text-xs text-mut">
              Open-risk budget (%)
              <input className="field" inputMode="decimal" value={settings.thresholds.openRiskBudgetPct} onChange={(e) => setThreshold("openRiskBudgetPct", Number(e.target.value) || 0)} />
            </label>
            <label className="grid gap-1 text-xs text-mut">
              Portfolio value ($)
              <input className="field" inputMode="decimal" value={settings.portfolioValue} onChange={(e) => setSetting("portfolioValue", Number(e.target.value) || 0)} />
            </label>
            <label className="grid gap-1 text-xs text-mut">
              Risk per trade (%)
              <input className="field" inputMode="decimal" value={settings.riskPerTradePct} onChange={(e) => setSetting("riskPerTradePct", Number(e.target.value) || 0)} />
            </label>
            <label className="grid gap-1 text-xs text-mut">
              Single-name cap (%)
              <input className="field" inputMode="decimal" value={settings.notionalCapPct} onChange={(e) => setSetting("notionalCapPct", Number(e.target.value) || 0)} />
            </label>
            <label className="grid gap-1 text-xs text-mut">
              Heat cap (%)
              <input className="field" inputMode="decimal" value={settings.heatCapPct} onChange={(e) => setSetting("heatCapPct", Number(e.target.value) || 0)} />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-faint">
            Thresholds are governance defaults, not proven forecasting signals.
          </p>
        </Panel>
      </div>

      <Panel eyebrow="Size from risk, never from conviction" title="Position-sizing calculator">
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="grid gap-1 text-xs text-mut">
            Entry ($)
            <input className="field" inputMode="decimal" value={entry} onChange={(e) => setEntry(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Initial stop ($)
            <input className="field" inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Planned target ($)
            <input className="field" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Risk budget (1R)" value={fmtUsd(sizing.riskDollars)} tone="gate" />
          <Stat label={sizing.capApplied ? "Shares (cap applied)" : "Max shares"} value={sizing.cappedShares !== null ? String(sizing.cappedShares) : "—"} />
          <Stat label="Position value" value={fmtUsd(sizing.notional)} />
          <Stat label="Reward / risk" value={sizing.rewardRisk !== null ? `${fmtN(sizing.rewardRisk, 2)}×` : "—"} />
        </div>
        {sizing.capApplied && (
          <p className="mt-2 font-mono text-[11px] text-reduced">
            Single-name cap ({settings.notionalCapPct}% of equity) reduced size below the pure risk-based{" "}
            {sizing.maxSharesByRisk} shares.
          </p>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Liability gap: a stop order does not guarantee execution at the stop price. Example — a gap through the
          stop to {fmtUsd(sizing.gapExamplePrice)} would mean roughly {fmtUsd(sizing.gapExampleLoss ? -sizing.gapExampleLoss : null)}{" "}
          gross, not −{fmtUsd(sizing.riskDollars)}. Cash-funded long trades are the default assumption; margin,
          shorts, and complex products need separate playbooks and lower budgets.
        </p>
      </Panel>
    </div>
  );
}
