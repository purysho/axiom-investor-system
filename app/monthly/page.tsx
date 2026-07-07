"use client";

import { useState } from "react";
import { fmtPct, fmtR, fmtUsd, Panel, Stat } from "@/components/chrome";
import { flowAdjustedReturnPct, journalStats } from "@/lib/engine/stats";
import type { MonthlyRow } from "@/lib/engine/types";
import { uid, update, useAppState } from "@/lib/store";

const numOrNull = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const emptyDraft = {
  monthStart: "",
  startingValue: "",
  netContributions: "0",
  endingValue: "",
  benchmarkReturnPct: "",
  notes: "",
  changeRule: false,
  oldRule: "",
  evidence: "",
  newRule: "",
  expectedBehavior: "",
  reviewDate: "",
};

export default function MonthlyPage() {
  const state = useAppState();
  const js = journalStats(state.trades);
  const [draft, setDraft] = useState(() => ({
    ...emptyDraft,
    monthStart: `${new Date().toISOString().slice(0, 7)}-01`,
  }));
  const [notice, setNotice] = useState("");

  const saveMonth = () => {
    if (numOrNull(draft.startingValue) === null || numOrNull(draft.endingValue) === null) {
      setNotice("Starting and ending values are required to compute the flow-adjusted return.");
      return;
    }
    if (draft.changeRule && (!draft.oldRule.trim() || !draft.newRule.trim() || !draft.evidence.trim())) {
      setNotice("A rule change needs the old rule, the evidence, and the exact new rule written down.");
      return;
    }
    const row: MonthlyRow = {
      id: uid("M"),
      monthStart: draft.monthStart,
      startingValue: numOrNull(draft.startingValue),
      netContributions: numOrNull(draft.netContributions),
      endingValue: numOrNull(draft.endingValue),
      benchmarkReturnPct: numOrNull(draft.benchmarkReturnPct),
      notes: draft.notes,
      ruleChange: draft.changeRule
        ? {
            oldRule: draft.oldRule,
            evidence: draft.evidence,
            newRule: draft.newRule,
            expectedBehavior: draft.expectedBehavior,
            reviewDate: draft.reviewDate,
          }
        : null,
    };
    update((prev) => ({ ...prev, monthly: [...prev.monthly, row] }));
    setDraft({ ...emptyDraft, monthStart: `${new Date().toISOString().slice(0, 7)}-01` });
    setNotice("Month saved. One material rule change at a time; safety reductions can be immediate.");
  };

  return (
    <div className="grid gap-3">
      <Panel eyebrow="Compare, diagnose, then adjust" title="Monthly performance & rule review">
        <div className="grid gap-2 text-xs leading-relaxed text-mut sm:grid-cols-4">
          <p><span className="font-mono text-ink">1 · Compare.</span> Calculate the flow-adjusted return and the benchmark gap. Is the benchmark appropriate for the mandate?</p>
          <p><span className="font-mono text-ink">2 · Attribute.</span> Explain the gap: allocation, selection, cash drag, concentration, active trading, costs, taxes when known.</p>
          <p><span className="font-mono text-ink">3 · Diagnose process.</span> Net swing P&amp;L, average R, win rate, profit factor, adherence, largest loss in R, mistake-tag frequency.</p>
          <p><span className="font-mono text-ink">4 · Change one rule.</span> Old rule, evidence and sample size, exact new rule, expected behavior, review date.</p>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Closed this ledger" value={String(js.closedCount)} />
        <Stat label="Avg R" value={fmtR(js.avgR)} />
        <Stat label="Largest loss" value={js.largestLossR !== null ? fmtR(js.largestLossR) : "—"} tone={js.largestLossR !== null && js.largestLossR < -1.2 ? "bad" : undefined} />
        <Stat label="Rule adherence" value={fmtPct(js.adherencePct, 0)} />
      </div>

      <Panel eyebrow={`${state.monthly.length} months recorded`} title="Monthly ledger">
        {state.monthly.length === 0 ? (
          <p className="text-xs text-faint">No months recorded yet. Reducing risk is a valid performance decision.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="eyebrow">
                  <th className="cell font-normal">Month</th>
                  <th className="cell font-normal">Return</th>
                  <th className="cell font-normal">Benchmark</th>
                  <th className="cell font-normal">Active gap</th>
                  <th className="cell hidden font-normal md:table-cell">Rule change</th>
                </tr>
              </thead>
              <tbody>
                {state.monthly.map((m) => {
                  const ret = flowAdjustedReturnPct(m.startingValue, m.netContributions, m.endingValue);
                  const gap = ret !== null && m.benchmarkReturnPct !== null ? ret - m.benchmarkReturnPct : null;
                  return (
                    <tr key={m.id} className="hover:bg-panel2">
                      <td className="cell">{m.monthStart.slice(0, 7)}</td>
                      <td className="cell text-mut">{fmtPct(ret)}</td>
                      <td className="cell text-mut">{fmtPct(m.benchmarkReturnPct)}</td>
                      <td className="cell font-semibold" style={{ color: gap === null ? undefined : gap >= 0 ? "#2FBF8F" : "#E5484D" }}>
                        {gap === null ? "—" : `${gap >= 0 ? "+" : "−"}${Math.abs(gap).toFixed(2)}%`}
                      </td>
                      <td className="cell hidden max-w-72 truncate text-faint md:table-cell">
                        {m.ruleChange ? `${m.ruleChange.oldRule} → ${m.ruleChange.newRule}` : "none"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel eyebrow="Close the month" title="Record a month">
        <div className="grid gap-2 sm:grid-cols-5">
          <label className="grid gap-1 text-xs text-mut">
            Month start (YYYY-MM-01)
            <input className="field" value={draft.monthStart} onChange={(e) => setDraft({ ...draft, monthStart: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Starting value ($)
            <input className="field" inputMode="decimal" value={draft.startingValue} onChange={(e) => setDraft({ ...draft, startingValue: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Net contributions ($)
            <input className="field" inputMode="decimal" value={draft.netContributions} onChange={(e) => setDraft({ ...draft, netContributions: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Ending value ($)
            <input className="field" inputMode="decimal" value={draft.endingValue} onChange={(e) => setDraft({ ...draft, endingValue: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Benchmark return (%)
            <input className="field" inputMode="decimal" value={draft.benchmarkReturnPct} onChange={(e) => setDraft({ ...draft, benchmarkReturnPct: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut sm:col-span-5">
            Notes — top 3 positive/negative contributors, concentration & event effects, income concentration
            <input className="field" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
          </label>
        </div>
        {(() => {
          const ret = flowAdjustedReturnPct(numOrNull(draft.startingValue), numOrNull(draft.netContributions), numOrNull(draft.endingValue));
          return ret !== null ? (
            <p className="mt-2 font-mono text-xs text-mut">
              Flow-adjusted return: <span style={{ color: "var(--gate)" }}>{fmtPct(ret, 2)}</span>{" "}
              <span className="text-faint">(simple approximation, not full time-weighted return)</span>
            </p>
          ) : null;
        })()}

        <label className="mt-3 flex items-center gap-2 text-xs text-mut">
          <input type="checkbox" className="accent-[var(--gate)]" checked={draft.changeRule} onChange={(e) => setDraft({ ...draft, changeRule: e.target.checked })} />
          Adopt one rule change this month
        </label>
        {draft.changeRule && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-mut">
              Old rule
              <input className="field" value={draft.oldRule} onChange={(e) => setDraft({ ...draft, oldRule: e.target.value })} />
            </label>
            <label className="grid gap-1 text-xs text-mut">
              Exact new rule
              <input className="field" value={draft.newRule} onChange={(e) => setDraft({ ...draft, newRule: e.target.value })} />
            </label>
            <label className="grid gap-1 text-xs text-mut">
              Evidence & sample size
              <input className="field" value={draft.evidence} onChange={(e) => setDraft({ ...draft, evidence: e.target.value })} />
            </label>
            <label className="grid gap-1 text-xs text-mut">
              Expected behavior change
              <input className="field" value={draft.expectedBehavior} onChange={(e) => setDraft({ ...draft, expectedBehavior: e.target.value })} />
            </label>
            <label className="grid gap-1 text-xs text-mut">
              Review date
              <input className="field" value={draft.reviewDate} onChange={(e) => setDraft({ ...draft, reviewDate: e.target.value })} />
            </label>
          </div>
        )}
        <div className="mt-2 flex items-center gap-3">
          <button type="button" className="btn-gate" onClick={saveMonth}>
            Save month
          </button>
          {notice && <span className="font-mono text-[11px] text-mut">{notice}</span>}
        </div>
        <p className="mt-2 text-[11px] text-faint">
          Separate outcome from process: a profitable rule violation is still a process failure. Change a rule
          only on a repeated pattern or inadequate risk control — never after one painful trade.
        </p>
      </Panel>
    </div>
  );
}
