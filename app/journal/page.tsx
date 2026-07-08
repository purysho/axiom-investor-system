"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, BookOpenText, Check, ChevronDown, CircleAlert, CircleCheckBig,
  Download, Plus, ShieldAlert, Sparkles, Upload,
} from "lucide-react";
import { EquityCurve, RDistribution } from "@/components/charts";
import { fmtPct, fmtR, fmtUsd } from "@/components/chrome";
import { toast } from "@/components/toast";
import { downloadText, exportJournalCsv, importJournalCsv } from "@/lib/csv";
import { evaluateGate } from "@/lib/engine/gate";
import { computeSizing } from "@/lib/engine/sizing";
import { journalStats, netPnl, plannedRiskUsd, rMultiple } from "@/lib/engine/stats";
import {
  EXIT_REASONS, GRADES, MISTAKE_TAGS, SETUPS,
  type Direction, type ExitReason, type Grade, type MistakeTag, type Setup, type Trade,
} from "@/lib/engine/types";
import { todayKey, uid, update, useAppState } from "@/lib/store";

const numOrNull = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const emptyEntry = {
  ticker: "", direction: "Long" as Direction, strategy: "" as Setup | "",
  entry: "", stop: "", target: "", shares: "", thesisGrade: "" as Grade | "",
  emotion: "3", thesis: "", exceptionNote: "",
};

const emptyClose = {
  exitDate: "", exitPrice: "", fees: "0", mfePct: "", maePct: "",
  exitReason: "" as ExitReason | "", mistakeTag: "None" as MistakeTag,
  ruleFollowed: "" as "Yes" | "No" | "", lesson: "",
  nextRuleChange: "" as "Yes" | "No" | "Review" | "", tags: "",
};

function tradeDiagnosis(t: Trade) {
  const r = rMultiple(t);
  const goodOutcome = r !== null && r >= 0;
  const goodProcess = t.ruleFollowed === "Yes";
  if (goodProcess && goodOutcome) return { label: "Good process, good outcome", short: "Skilled win", bg: "#e7efe9", ink: "#2e6a50" };
  if (goodProcess && !goodOutcome) return { label: "Good process, bad outcome", short: "Valid loss", bg: "#e8edf0", ink: "#526d79" };
  if (!goodProcess && goodOutcome) return { label: "Poor process, good outcome", short: "Lucky win", bg: "#f5ead6", ink: "#9d6a2c" };
  return { label: "Poor process, bad outcome", short: "Process loss", bg: "#f6e8e3", ink: "#a45645" };
}

export default function JournalPage() {
  const state = useAppState();
  const gate = evaluateGate(state.gateInputs, state.settings, state.trades);
  const stats = journalStats(state.trades);
  const open = state.trades.filter((t) => t.status === "Open");
  const closed = state.trades.filter((t) => t.status === "Closed").slice().reverse();
  const reflectionDue = closed.filter((t) => !t.lesson || !t.ruleFollowed);

  const [entry, setEntry] = useState(emptyEntry);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [closeForm, setCloseForm] = useState(emptyClose);
  const fileRef = useRef<HTMLInputElement>(null);
  const gateOpen = gate.state === "RISK ALLOWED";

  const suggested = computeSizing({
    portfolioValue: state.settings.portfolioValue,
    riskPerTradePct: state.settings.riskPerTradePct,
    entry: numOrNull(entry.entry), stop: numOrNull(entry.stop), target: numOrNull(entry.target),
    notionalCapPct: state.settings.notionalCapPct,
  });

  const logTrade = () => {
    if (!entry.ticker.trim() || numOrNull(entry.entry) === null || numOrNull(entry.stop) === null) {
      toast("Ticker, entry and initial stop are required.", "warning");
      return;
    }
    if (!gateOpen && !entry.exceptionNote.trim()) {
      toast(`Risk check is ${gate.state} — write the exception before logging the trade.`, "warning");
      return;
    }
    const t: Trade = {
      id: uid("T"), status: "Open", gateAtEntry: gate.state, strategy: entry.strategy,
      ticker: entry.ticker.trim().toUpperCase(), direction: entry.direction, sleeve: "Satellite",
      entryDate: todayKey(), exitDate: "", entry: numOrNull(entry.entry), stop: numOrNull(entry.stop),
      target: numOrNull(entry.target), shares: numOrNull(entry.shares), exitPrice: null, fees: null,
      mfePct: null, maePct: null, thesisGrade: entry.thesisGrade, emotion: numOrNull(entry.emotion),
      ruleFollowed: "", exitReason: "", mistakeTag: "", thesis: entry.thesis, lesson: "",
      nextRuleChange: "", tags: "", exceptionNote: entry.exceptionNote.trim() || undefined,
    };
    update((prev) => ({ ...prev, trades: [...prev.trades, t] }));
    setEntry(emptyEntry);
    toast(`${t.ticker} added to the journal.`);
  };

  const startClose = (id: string) => {
    const trade = state.trades.find((t) => t.id === id);
    setClosingId(id);
    setCloseForm({
      ...emptyClose,
      exitDate: trade?.exitDate || todayKey(),
      exitPrice: trade?.exitPrice?.toString() ?? "",
      fees: trade?.fees?.toString() ?? "0",
      mfePct: trade?.mfePct?.toString() ?? "",
      maePct: trade?.maePct?.toString() ?? "",
      exitReason: trade?.exitReason ?? "",
      mistakeTag: (trade?.mistakeTag || "None") as MistakeTag,
      ruleFollowed: trade?.ruleFollowed ?? "",
      lesson: trade?.lesson ?? "",
      nextRuleChange: trade?.nextRuleChange ?? "",
      tags: trade?.tags ?? "",
    });
    setTimeout(() => document.getElementById("close-trade")?.scrollIntoView({ behavior: "smooth" }), 0);
  };

  const commitClose = () => {
    if (!closingId) return;
    if (numOrNull(closeForm.exitPrice) === null || !closeForm.exitReason || !closeForm.ruleFollowed) {
      toast("Exit price, why you exited, and whether you followed the plan are required.", "warning");
      return;
    }
    update((prev) => ({
      ...prev,
      trades: prev.trades.map((t) => t.id === closingId ? {
        ...t, status: "Closed", exitDate: closeForm.exitDate || todayKey(),
        exitPrice: numOrNull(closeForm.exitPrice), fees: numOrNull(closeForm.fees) ?? 0,
        mfePct: numOrNull(closeForm.mfePct), maePct: numOrNull(closeForm.maePct),
        exitReason: closeForm.exitReason, mistakeTag: closeForm.mistakeTag,
        ruleFollowed: closeForm.ruleFollowed, lesson: closeForm.lesson,
        nextRuleChange: closeForm.nextRuleChange, tags: closeForm.tags,
      } : t),
    }));
    setClosingId(null);
    toast("Trade closed and reflection saved.");
  };

  const onImport = async (file: File) => {
    const text = await file.text();
    const trades = importJournalCsv(text);
    if (!trades.length) { toast("No journal rows were recognised.", "error"); return; }
    update((prev) => ({ ...prev, trades: [...prev.trades, ...trades] }));
    toast(`${trades.length} trade${trades.length === 1 ? "" : "s"} imported.`);
  };

  return (
    <div>
      <section className={`mb-10 rounded-[26px] p-6 sm:p-9 ${reflectionDue.length ? "bg-[#f5ead6]" : "bg-[#e7eee8]"}`}>
        {reflectionDue.length ? <CircleAlert size={25} className="text-[#9d6a2c]" /> : <BookOpenText size={25} className="text-[#456555]" />}
        <h2 className="mt-5 max-w-3xl font-display text-[2.35rem] font-semibold leading-[1.04] tracking-[-0.04em] sm:text-[3.4rem]">
          {reflectionDue.length ? `${reflectionDue.length} closed trade${reflectionDue.length === 1 ? " still needs" : "s still need"} a reflection.` : closed.length ? "Your trade notes are up to date." : "The journal starts with a plan, not a result."}
        </h2>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-mut">
          {reflectionDue.length ? "Do not skip the uncomfortable part. A trade becomes useful evidence only after you record whether you followed the plan and what the decision taught you." : "Use the journal to compare the plan with what actually happened. Profit is an outcome; following or breaking your rules is the process."}
        </p>
        {reflectionDue.length > 0 && <button type="button" className="btn-primary mt-7" onClick={() => document.getElementById("closed-trades")?.scrollIntoView({ behavior: "smooth" })}>Review closed trades <ArrowRight size={16} /></button>}
      </section>

      <section className="mb-12">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="page-kicker">While the trade is open</div><h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Open trades</h2><p className="mt-2 text-sm text-mut">Keep this list small. The journal is the source of truth for the entry, stop and planned risk.</p></div>
          <span className="text-sm text-mut">{open.length} open trade{open.length === 1 ? "" : "s"}</span>
        </div>

        {open.length === 0 ? (
          <div className="border-y border-[#d9d2c6] py-8">
            <CircleCheckBig size={22} className="text-[#49695a]" />
            <h3 className="mt-4 font-display text-[1.8rem] font-semibold tracking-[-0.03em]">No open swing trades.</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mut">That is a valid portfolio state. Add a trade only after the risk check and a real trade plan.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#d9d2c6] border-y border-[#d9d2c6]">
            {open.map((t) => (
              <div key={t.id} className="grid gap-4 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-3"><span className="text-[18px] font-bold">{t.ticker}</span><span className="badge bg-[#eeeae1] text-[#69736d]">{t.direction}</span>{t.strategy && <span className="text-sm text-mut">{t.strategy}</span>}</div>
                  <p className="mt-2 text-sm text-mut">Entered at {t.entry ?? "—"} · Initial stop {t.stop ?? "—"} · Planned risk {fmtUsd(plannedRiskUsd(t))}</p>
                  {t.thesis && <p className="mt-1 max-w-2xl text-sm text-mut">Plan: {t.thesis}</p>}
                  <p className="mt-1 text-xs text-faint">Risk check at entry: {t.gateAtEntry || "not recorded"}</p>
                </div>
                <button type="button" className="btn-primary" onClick={() => startClose(t.id)}>Close and reflect <ArrowRight size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      {closingId && (
        <section id="close-trade" className="mb-12 rounded-[24px] bg-[#fffdf8]/78 p-6 sm:p-9">
          <div className="max-w-2xl">
            <div className="page-kicker">Close the loop</div>
            <h2 className="mt-1 font-display text-[2.1rem] font-semibold tracking-[-0.035em]">What happened, and did you follow the plan?</h2>
            <p className="mt-3 text-sm leading-relaxed text-mut">The first three answers matter most. Optional analytics can be added later.</p>
          </div>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <label className="field-label">Exit price ($)<input className="field mt-1.5" inputMode="decimal" value={closeForm.exitPrice} onChange={(e) => setCloseForm({ ...closeForm, exitPrice: e.target.value })} /></label>
            <label className="field-label">Why did you exit?<select className="field mt-1.5" value={closeForm.exitReason} onChange={(e) => setCloseForm({ ...closeForm, exitReason: e.target.value as ExitReason })}><option value="">Choose the closest reason</option>{EXIT_REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
            <label className="field-label sm:col-span-2">Did you follow the plan you wrote before the trade?<select className="field mt-1.5" value={closeForm.ruleFollowed} onChange={(e) => setCloseForm({ ...closeForm, ruleFollowed: e.target.value as "Yes" | "No" })}><option value="">Choose one</option><option>Yes</option><option>No</option></select></label>
            <label className="field-label sm:col-span-2">What is the one lesson worth carrying forward?<textarea className="field mt-1.5 min-h-28" value={closeForm.lesson} onChange={(e) => setCloseForm({ ...closeForm, lesson: e.target.value })} placeholder="Write one testable sentence. Example: I exit pullbacks too early when the trade is profitable but the original invalidation has not changed." /></label>
            <label className="field-label">Primary mistake, if any<select className="field mt-1.5" value={closeForm.mistakeTag} onChange={(e) => setCloseForm({ ...closeForm, mistakeTag: e.target.value as MistakeTag })}>{MISTAKE_TAGS.map((m) => <option key={m}>{m}</option>)}</select></label>
            <label className="field-label">Should a rule change be reviewed later?<select className="field mt-1.5" value={closeForm.nextRuleChange} onChange={(e) => setCloseForm({ ...closeForm, nextRuleChange: e.target.value as "Yes" | "No" | "Review" })}><option value="">Not decided</option><option>No</option><option>Review</option><option>Yes</option></select></label>
          </div>
          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-semibold text-[#49695a]">Optional trade analytics</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="field-label">Exit date<input className="field mt-1.5" value={closeForm.exitDate} onChange={(e) => setCloseForm({ ...closeForm, exitDate: e.target.value })} /></label>
              <label className="field-label">Fees / slippage ($)<input className="field mt-1.5" inputMode="decimal" value={closeForm.fees} onChange={(e) => setCloseForm({ ...closeForm, fees: e.target.value })} /></label>
              <label className="field-label">MFE (%)<input className="field mt-1.5" inputMode="decimal" value={closeForm.mfePct} onChange={(e) => setCloseForm({ ...closeForm, mfePct: e.target.value })} /></label>
              <label className="field-label">MAE (%)<input className="field mt-1.5" inputMode="decimal" value={closeForm.maePct} onChange={(e) => setCloseForm({ ...closeForm, maePct: e.target.value })} /></label>
              <label className="field-label sm:col-span-2 lg:col-span-4">Tags<input className="field mt-1.5" value={closeForm.tags} onChange={(e) => setCloseForm({ ...closeForm, tags: e.target.value })} placeholder="semicolon-separated; e.g. moved-stop; early-exit" /></label>
            </div>
          </details>
          <div className="mt-7 flex flex-wrap gap-3"><button type="button" className="btn-primary" onClick={commitClose}>Save the reflection <Check size={15} /></button><button type="button" className="btn" onClick={() => setClosingId(null)}>Cancel</button></div>
        </section>
      )}

      <section className="mb-12 border-t border-[#d7d0c4] pt-10">
        <details>
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between gap-4">
              <div><div className="page-kicker">Only after the plan exists</div><h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Add a new open trade</h2><p className="mt-2 text-sm text-mut">Record the entry, initial stop and reason for the trade before the outcome changes the story.</p></div>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ebe7dc] text-[#49695a]"><Plus size={18} /></span>
            </div>
          </summary>
          <div className="mt-7 rounded-[22px] bg-[#fffdf8]/78 p-6 sm:p-8">
            {!gateOpen && (
              <div className="mb-6 flex items-start gap-3 rounded-[18px] bg-[#f6e8e3] p-5"><ShieldAlert size={20} className="mt-0.5 shrink-0 text-[#a45645]" /><div><div className="font-semibold">Today's risk check is {gate.state.toLowerCase()}.</div><p className="mt-1 text-sm leading-relaxed text-mut">Your process says {gate.state === "NO NEW SWINGS" ? "manage existing positions only" : "use smaller risk or stand aside"}. Logging a new trade requires a written exception that stays on the record.</p><Link href="/gate" className="quiet-link mt-3">Review the risk check <ArrowRight size={14} /></Link></div></div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="field-label">Ticker<input className="field mt-1.5" value={entry.ticker} onChange={(e) => setEntry({ ...entry, ticker: e.target.value })} /></label>
              <label className="field-label">Direction<select className="field mt-1.5" value={entry.direction} onChange={(e) => setEntry({ ...entry, direction: e.target.value as Direction })}><option>Long</option><option>Short</option></select></label>
              <label className="field-label">Setup<select className="field mt-1.5" value={entry.strategy} onChange={(e) => setEntry({ ...entry, strategy: e.target.value as Setup })}><option value="">Choose a setup</option>{SETUPS.map((s) => <option key={s}>{s}</option>)}</select></label>
              <label className="field-label">Pre-trade thesis grade<select className="field mt-1.5" value={entry.thesisGrade} onChange={(e) => setEntry({ ...entry, thesisGrade: e.target.value as Grade })}><option value="">Not graded</option>{GRADES.map((g) => <option key={g}>{g}</option>)}</select></label>
              <label className="field-label">Entry ($)<input className="field mt-1.5" inputMode="decimal" value={entry.entry} onChange={(e) => setEntry({ ...entry, entry: e.target.value })} /></label>
              <label className="field-label">Initial stop ($)<input className="field mt-1.5" inputMode="decimal" value={entry.stop} onChange={(e) => setEntry({ ...entry, stop: e.target.value })} /></label>
              <label className="field-label">Planned target ($)<input className="field mt-1.5" inputMode="decimal" value={entry.target} onChange={(e) => setEntry({ ...entry, target: e.target.value })} /></label>
              <label className="field-label">Shares<input className="field mt-1.5" inputMode="decimal" value={entry.shares} onChange={(e) => setEntry({ ...entry, shares: e.target.value })} placeholder={suggested.cappedShares !== null ? `Suggested max ${suggested.cappedShares}` : ""} /></label>
              <label className="field-label sm:col-span-2 lg:col-span-4">Why does this trade exist?<textarea className="field mt-1.5 min-h-24" value={entry.thesis} onChange={(e) => setEntry({ ...entry, thesis: e.target.value })} placeholder="Write the setup, what would prove the idea wrong, and why the target is reasonable." /></label>
              {!gateOpen && <label className="field-label sm:col-span-2 lg:col-span-4 text-[#98493e]">Written exception required<input className="field mt-1.5" value={entry.exceptionNote} onChange={(e) => setEntry({ ...entry, exceptionNote: e.target.value })} placeholder="Why are you overriding today's risk permission?" /></label>}
            </div>
            <div className="mt-5 rounded-[16px] bg-[#ebe7dc] p-4 text-sm text-mut">Based on your current risk settings and entry/stop, AXIOM suggests at most <strong className="text-ink">{suggested.cappedShares ?? "—"} shares</strong> and a planned loss budget of <strong className="text-ink">{fmtUsd(suggested.riskDollars)}</strong>. This is planned stop risk, not a guaranteed maximum loss.</div>
            <button type="button" className="btn-primary mt-6" onClick={logTrade}>Add open trade <Plus size={15} /></button>
          </div>
        </details>
      </section>

      <section id="closed-trades" className="mb-12 border-t border-[#d7d0c4] pt-10">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="page-kicker">The learning record</div><h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Closed trades</h2><p className="mt-2 text-sm text-mut">Read the process diagnosis before the profit or loss. A lucky win should not teach the wrong lesson.</p></div>
          <span className="text-sm text-mut">{closed.length} closed trade{closed.length === 1 ? "" : "s"}</span>
        </div>
        {closed.length === 0 ? (
          <div className="border-y border-[#d9d2c6] py-8"><Sparkles size={22} className="text-[#a16b4c]" /><h3 className="mt-4 font-display text-[1.8rem] font-semibold tracking-[-0.03em]">Your evidence will build one trade at a time.</h3><p className="mt-2 max-w-2xl text-sm leading-relaxed text-mut">The first goal is not a high win rate. It is a clean record of plans, outcomes and rule adherence.</p></div>
        ) : (
          <div className="divide-y divide-[#d9d2c6] border-y border-[#d9d2c6]">
            {closed.map((t) => {
              const diagnosis = tradeDiagnosis(t);
              const r = rMultiple(t);
              const n = netPnl(t);
              return (
                <details key={t.id} className="group">
                  <summary className="grid cursor-pointer list-none gap-4 py-5 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                    <div><div className="flex flex-wrap items-center gap-3"><span className="text-[18px] font-bold">{t.ticker}</span><span className="badge" style={{ background: diagnosis.bg, color: diagnosis.ink }}>{diagnosis.short}</span>{!t.lesson && <span className="badge bg-[#f2eadb] text-[#9d6a2c]">Reflection incomplete</span>}</div><p className="mt-1 text-sm text-mut">{diagnosis.label} · {t.exitReason || "exit reason not recorded"}</p></div>
                    <div className="sm:text-right"><div className="text-lg font-semibold" style={{ color: r !== null && r >= 0 ? "#2e6a50" : "#a45645" }}>{fmtR(r)}</div><div className="text-xs text-faint">{fmtUsd(n)} net</div></div>
                    <div className="flex items-center gap-1 text-sm font-semibold text-[#49695a]">Read reflection <ChevronDown size={15} className="transition-transform group-open:rotate-180" /></div>
                  </summary>
                  <div className="mb-6 rounded-[20px] bg-[#fffdf8]/76 p-5 sm:p-7">
                    <div className="grid gap-5 sm:grid-cols-3">
                      <div><div className="text-xs font-semibold text-faint">Did I follow the plan?</div><div className="mt-1 font-semibold">{t.ruleFollowed || "Not answered"}</div></div>
                      <div><div className="text-xs font-semibold text-faint">Primary mistake</div><div className="mt-1 font-semibold">{t.mistakeTag || "Not recorded"}</div></div>
                      <div><div className="text-xs font-semibold text-faint">Gate at entry</div><div className="mt-1 font-semibold">{t.gateAtEntry || "Not recorded"}</div></div>
                    </div>
                    <div className="mt-6 border-l-2 border-[#c49a78] pl-5"><div className="text-xs font-semibold text-faint">Lesson</div><p className="mt-2 text-[16px] leading-relaxed text-ink">{t.lesson || "No lesson has been written yet."}</p></div>
                    {t.tags && <p className="mt-5 text-sm text-mut">Tags: {t.tags}</p>}
                    {(!t.lesson || !t.ruleFollowed) && (
                      <button type="button" className="btn-primary mt-6" onClick={() => startClose(t.id)}>Complete this reflection <ArrowRight size={15} /></button>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>

      {closed.length > 0 && (
        <section className="border-t border-[#d7d0c4] pt-10">
          <details>
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between gap-4">
                <div><div className="page-kicker">After enough trades</div><h2 className="mt-1 font-display text-[1.9rem] font-semibold tracking-[-0.03em]">Patterns and statistics</h2><p className="mt-2 text-sm text-mut">Useful for monthly review. Do not change a rule because one number moved after one trade.</p></div>
                <ChevronDown size={20} className="shrink-0 text-faint" />
              </div>
            </summary>
            <div className="mt-7 rounded-[22px] bg-[#fffdf8]/76 p-6 sm:p-8">
              <div className="grid gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="stat-line"><div className="stat-label">Net P&L</div><div className="stat-value">{fmtUsd(stats.netPnlUsd)}</div></div>
                <div className="stat-line"><div className="stat-label">Expectancy</div><div className="stat-value">{fmtR(stats.expectancyR)}</div></div>
                <div className="stat-line"><div className="stat-label">Win rate</div><div className="stat-value">{fmtPct(stats.winRatePct, 0)}</div></div>
                <div className="stat-line"><div className="stat-label">Rule adherence</div><div className="stat-value">{fmtPct(stats.adherencePct, 0)}</div></div>
              </div>
              {(stats.mistakeCounts.length > 0 || stats.leakFlags.length > 0) && <div className="mt-6 border-t border-[#ddd6ca] pt-5"><div className="font-semibold">Repeated tags</div><p className="mt-2 text-sm leading-relaxed text-mut">{stats.mistakeCounts.map(([tag, n]) => `${tag} ×${n}`).join(" · ") || "No mistake tags yet"}{stats.leakFlags.length ? ` · Behavioural leaks: ${stats.leakFlags.map(([tag, n]) => `${tag} ×${n}`).join(" · ")}` : ""}</p></div>}
              {stats.closedCount >= 2 && <div className="mt-7 grid gap-6 md:grid-cols-2"><div><div className="mb-3 font-semibold">Cumulative R</div><EquityCurve trades={state.trades} /></div><div><div className="mb-3 font-semibold">Outcome distribution</div><RDistribution trades={state.trades} /></div></div>}
              <div className="mt-7 flex flex-wrap gap-3 border-t border-[#ddd6ca] pt-5"><button type="button" className="btn" onClick={() => downloadText("trading-journal.csv", exportJournalCsv(state.trades))}><Download size={15} />Export journal</button><button type="button" className="btn" onClick={() => fileRef.current?.click()}><Upload size={15} />Import journal</button><input ref={fileRef} type="file" accept=".csv,.txt,.md" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImport(f); e.target.value = ""; }} /></div>
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
