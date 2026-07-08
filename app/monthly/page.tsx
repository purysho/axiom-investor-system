"use client";

import { useState } from "react";
import {
  ArrowRight, BarChart3, Check, ChevronDown, CircleCheckBig, RefreshCcw, Scale, Sparkles,
} from "lucide-react";
import { fmtPct, fmtR, fmtUsd } from "@/components/chrome";
import { flowAdjustedReturnPct, journalStats } from "@/lib/engine/stats";
import type { MonthlyRow } from "@/lib/engine/types";
import { uid, update, useAppState } from "@/lib/store";

const numOrNull = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const emptyDraft = {
  monthStart: "", startingValue: "", netContributions: "0", endingValue: "",
  benchmarkReturnPct: "", notes: "", changeRule: false, oldRule: "", evidence: "",
  newRule: "", expectedBehavior: "", reviewDate: "",
};

export default function MonthlyPage() {
  const state = useAppState();
  const js = journalStats(state.trades);
  const [draft, setDraft] = useState(() => ({ ...emptyDraft, monthStart: `${new Date().toISOString().slice(0, 7)}-01` }));
  const [notice, setNotice] = useState("");

  const draftReturn = flowAdjustedReturnPct(numOrNull(draft.startingValue), numOrNull(draft.netContributions), numOrNull(draft.endingValue));
  const draftBenchmark = numOrNull(draft.benchmarkReturnPct);
  const draftGap = draftReturn !== null && draftBenchmark !== null ? draftReturn - draftBenchmark : null;

  const saveMonth = () => {
    if (numOrNull(draft.startingValue) === null || numOrNull(draft.endingValue) === null) {
      setNotice("Add the starting and ending portfolio values first.");
      return;
    }
    if (draft.changeRule && (!draft.oldRule.trim() || !draft.newRule.trim() || !draft.evidence.trim())) {
      setNotice("A rule change needs the old rule, the evidence, and the exact new rule.");
      return;
    }
    const row: MonthlyRow = {
      id: uid("M"), monthStart: draft.monthStart, startingValue: numOrNull(draft.startingValue),
      netContributions: numOrNull(draft.netContributions), endingValue: numOrNull(draft.endingValue),
      benchmarkReturnPct: numOrNull(draft.benchmarkReturnPct), notes: draft.notes,
      ruleChange: draft.changeRule ? {
        oldRule: draft.oldRule, evidence: draft.evidence, newRule: draft.newRule,
        expectedBehavior: draft.expectedBehavior, reviewDate: draft.reviewDate,
      } : null,
    };
    update((prev) => ({ ...prev, monthly: [...prev.monthly, row] }));
    setDraft({ ...emptyDraft, monthStart: `${new Date().toISOString().slice(0, 7)}-01` });
    setNotice("Month saved. Carry the decision forward; do not keep editing rules during the trading day.");
  };

  return (
    <div>
      <section className="mb-10 rounded-[26px] bg-[#EFF6F1] p-6 sm:p-9">
        <Sparkles size={25} className="text-[#456555]" />
        <h2 className="mt-5 max-w-3xl font-display text-[2.35rem] font-semibold leading-[1.04] tracking-[-0.04em] sm:text-[3.4rem]">Did your process improve this month?</h2>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-mut">Do this once at month-end. First compare results, then explain them, then look for repeated process problems. Change one rule only when the evidence deserves it.</p>
      </section>

      <section className="mb-12">
        <div className="mb-7 max-w-2xl">
          <div className="page-kicker">Step 1 of 4</div>
          <h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Compare your result with the benchmark</h2>
          <p className="mt-3 text-sm leading-relaxed text-mut">The purpose is not to feel good or bad about a month. You are asking whether your portfolio did what its mandate should reasonably be compared with.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="field-label">Month<input className="field mt-1.5" value={draft.monthStart} onChange={(e) => setDraft({ ...draft, monthStart: e.target.value })} placeholder="YYYY-MM-01" /></label>
          <label className="field-label">Starting portfolio value ($)<input className="field mt-1.5" inputMode="decimal" value={draft.startingValue} onChange={(e) => setDraft({ ...draft, startingValue: e.target.value })} /></label>
          <label className="field-label">Money added or withdrawn ($)<input className="field mt-1.5" inputMode="decimal" value={draft.netContributions} onChange={(e) => setDraft({ ...draft, netContributions: e.target.value })} /></label>
          <label className="field-label">Ending portfolio value ($)<input className="field mt-1.5" inputMode="decimal" value={draft.endingValue} onChange={(e) => setDraft({ ...draft, endingValue: e.target.value })} /></label>
          <label className="field-label">Benchmark return (%)<input className="field mt-1.5" inputMode="decimal" value={draft.benchmarkReturnPct} onChange={(e) => setDraft({ ...draft, benchmarkReturnPct: e.target.value })} /></label>
        </div>
        <div className="mt-6 grid gap-5 border-y border-[#27312B] py-6 sm:grid-cols-3">
          <div><div className="text-xs font-semibold text-faint">Your approximate return</div><div className="mt-1 text-2xl font-semibold">{fmtPct(draftReturn, 2)}</div></div>
          <div><div className="text-xs font-semibold text-faint">Benchmark</div><div className="mt-1 text-2xl font-semibold">{fmtPct(draftBenchmark, 2)}</div></div>
          <div><div className="text-xs font-semibold text-faint">Gap</div><div className="mt-1 text-2xl font-semibold" style={{ color: draftGap === null ? undefined : draftGap >= 0 ? "#34D399" : "#F4645C" }}>{draftGap === null ? "—" : `${draftGap >= 0 ? "+" : "−"}${Math.abs(draftGap).toFixed(2)}%`}</div></div>
        </div>
        <p className="mt-3 text-xs text-faint">The return shown here is a simple flow-adjusted approximation, not a full time-weighted performance calculation.</p>
      </section>

      <section className="mb-12 border-t border-[#27312B] pt-10">
        <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <div className="page-kicker">Step 2 of 4</div>
            <h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Explain the gap in ordinary language</h2>
            <p className="mt-3 text-sm leading-relaxed text-mut">Was the result mainly allocation, stock selection, cash, concentration, swing trading, costs or tax? Write what you can support. “The market was weird” is not attribution.</p>
          </div>
          <label className="field-label">What actually drove this month's result?<textarea className="field mt-1.5 min-h-44" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Example: Cash was 12% of the portfolio during a rising month, creating about half of the benchmark gap. Two large technology holdings created most of the positive selection effect. Swing trades were slightly negative after one oversized loss." /></label>
        </div>
      </section>

      <section className="mb-12 border-t border-[#27312B] pt-10">
        <div className="page-kicker">Step 3 of 4</div>
        <h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Look for a repeated process problem</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-mut">These journal numbers are context, not grades. A rule deserves review when the same behaviour keeps appearing or the current risk control is clearly inadequate.</p>
        <div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="border-l-2 border-[#8fa296] pl-5"><BarChart3 size={18} className="text-[#49695a]" /><div className="mt-3 text-xs font-semibold text-faint">Closed trades</div><div className="mt-1 text-2xl font-semibold">{js.closedCount}</div></div>
          <div className="border-l-2 border-[#8fa296] pl-5"><Scale size={18} className="text-[#49695a]" /><div className="mt-3 text-xs font-semibold text-faint">Average R</div><div className="mt-1 text-2xl font-semibold">{fmtR(js.avgR)}</div></div>
          <div className="border-l-2 border-[#F0B429] pl-5"><RefreshCcw size={18} className="text-[#a16b4c]" /><div className="mt-3 text-xs font-semibold text-faint">Largest loss</div><div className="mt-1 text-2xl font-semibold">{js.largestLossR !== null ? fmtR(js.largestLossR) : "—"}</div></div>
          <div className="border-l-2 border-[#8fa296] pl-5"><CircleCheckBig size={18} className="text-[#49695a]" /><div className="mt-3 text-xs font-semibold text-faint">Rule adherence</div><div className="mt-1 text-2xl font-semibold">{fmtPct(js.adherencePct, 0)}</div></div>
        </div>
        {js.mistakeCounts.length > 0 && <div className="mt-7 rounded-[18px] bg-[#fffdf8]/75 p-5"><div className="font-semibold">Repeated journal tags</div><p className="mt-2 text-sm leading-relaxed text-mut">{js.mistakeCounts.map(([tag, n]) => `${tag} ×${n}`).join(" · ")}. A repeated tag is a question to investigate, not an automatic new rule.</p></div>}
      </section>

      <section className="mb-12 border-t border-[#27312B] pt-10">
        <div className="max-w-2xl">
          <div className="page-kicker">Step 4 of 4</div>
          <h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Does one rule need to change?</h2>
          <p className="mt-3 text-sm leading-relaxed text-mut">Most months, the correct answer may be no. Do not redesign your process after one painful loss or one lucky streak.</p>
        </div>
        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-[18px] bg-[#fffdf8]/70 p-5">
          <input type="checkbox" className="mt-1" checked={draft.changeRule} onChange={(e) => setDraft({ ...draft, changeRule: e.target.checked })} />
          <span><span className="block font-semibold">Yes, I have enough evidence to test one rule change</span><span className="mt-1 block text-sm text-mut">The change will be exact, linked to evidence, and given a review date.</span></span>
        </label>
        {draft.changeRule && (
          <div className="mt-5 rounded-[22px] bg-[#fffdf8]/76 p-6 sm:p-8">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="field-label">What is the current rule?<textarea className="field mt-1.5 min-h-24" value={draft.oldRule} onChange={(e) => setDraft({ ...draft, oldRule: e.target.value })} /></label>
              <label className="field-label">What exactly will the new rule be?<textarea className="field mt-1.5 min-h-24" value={draft.newRule} onChange={(e) => setDraft({ ...draft, newRule: e.target.value })} /></label>
              <label className="field-label">What evidence supports the change, and how large is the sample?<textarea className="field mt-1.5 min-h-24" value={draft.evidence} onChange={(e) => setDraft({ ...draft, evidence: e.target.value })} /></label>
              <label className="field-label">What behaviour should this change improve?<textarea className="field mt-1.5 min-h-24" value={draft.expectedBehavior} onChange={(e) => setDraft({ ...draft, expectedBehavior: e.target.value })} /></label>
              <label className="field-label">When will you review the experiment?<input className="field mt-1.5" value={draft.reviewDate} onChange={(e) => setDraft({ ...draft, reviewDate: e.target.value })} placeholder="YYYY-MM-DD" /></label>
            </div>
          </div>
        )}
        <div className="mt-7 flex flex-wrap items-center gap-4"><button type="button" className="btn-primary" onClick={saveMonth}>Save this month's review <Check size={15} /></button>{notice && <span className="text-sm text-mut">{notice}</span>}</div>
      </section>

      {state.monthly.length > 0 && (
        <section className="border-t border-[#27312B] pt-10">
          <details>
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between gap-4"><div><div className="page-kicker">Your review history</div><h2 className="mt-1 font-display text-[1.9rem] font-semibold tracking-[-0.03em]">Previous months</h2><p className="mt-2 text-sm text-mut">Use this to see whether the same explanations and rule changes keep repeating.</p></div><ChevronDown size={20} className="shrink-0 text-faint" /></div>
            </summary>
            <div className="mt-7 divide-y divide-[#27312B] border-y border-[#27312B]">
              {state.monthly.slice().reverse().map((m) => {
                const ret = flowAdjustedReturnPct(m.startingValue, m.netContributions, m.endingValue);
                const gap = ret !== null && m.benchmarkReturnPct !== null ? ret - m.benchmarkReturnPct : null;
                return (
                  <details key={m.id} className="group">
                    <summary className="grid cursor-pointer list-none gap-4 py-5 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                      <div><div className="text-[18px] font-bold">{m.monthStart.slice(0, 7)}</div><p className="mt-1 text-sm text-mut">{m.ruleChange ? "One rule experiment recorded" : "No rule change recorded"}</p></div>
                      <div className="sm:text-right"><div className="font-semibold">{fmtPct(ret, 2)}</div><div className="text-xs text-faint">Portfolio return</div></div>
                      <div className="flex items-center gap-1 text-sm font-semibold text-[#49695a]">Read review <ChevronDown size={15} className="transition-transform group-open:rotate-180" /></div>
                    </summary>
                    <div className="mb-6 rounded-[20px] bg-[#fffdf8]/76 p-5 sm:p-7">
                      <div className="grid gap-5 sm:grid-cols-3"><div><div className="text-xs font-semibold text-faint">Return</div><div className="mt-1 text-xl font-semibold">{fmtPct(ret, 2)}</div></div><div><div className="text-xs font-semibold text-faint">Benchmark</div><div className="mt-1 text-xl font-semibold">{fmtPct(m.benchmarkReturnPct, 2)}</div></div><div><div className="text-xs font-semibold text-faint">Gap</div><div className="mt-1 text-xl font-semibold">{gap === null ? "—" : `${gap >= 0 ? "+" : "−"}${Math.abs(gap).toFixed(2)}%`}</div></div></div>
                      <div className="mt-6 border-l-2 border-[#F0B429] pl-5"><div className="text-xs font-semibold text-faint">What drove the month</div><p className="mt-2 text-sm leading-relaxed text-ink">{m.notes || "No attribution note was saved."}</p></div>
                      {m.ruleChange && <div className="mt-6 rounded-[16px] bg-[#151B17] p-5"><div className="text-xs font-semibold text-faint">Rule experiment</div><p className="mt-2 text-sm leading-relaxed text-ink"><strong>{m.ruleChange.oldRule}</strong> → <strong>{m.ruleChange.newRule}</strong></p><p className="mt-2 text-sm text-mut">Evidence: {m.ruleChange.evidence}. Review: {m.ruleChange.reviewDate || "not dated"}.</p></div>}
                    </div>
                  </details>
                );
              })}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
