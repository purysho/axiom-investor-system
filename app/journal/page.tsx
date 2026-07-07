"use client";

import { useRef, useState } from "react";
import { EquityCurve, RDistribution } from "@/components/charts";
import { fmtPct, fmtR, fmtUsd, Panel, Stat } from "@/components/chrome";
import { toast } from "@/components/toast";
import { downloadText, exportJournalCsv, importJournalCsv } from "@/lib/csv";
import { evaluateGate } from "@/lib/engine/gate";
import { computeSizing } from "@/lib/engine/sizing";
import { journalStats, netPnl, plannedRiskUsd, rMultiple } from "@/lib/engine/stats";
import {
  EXIT_REASONS,
  GRADES,
  MISTAKE_TAGS,
  SETUPS,
  type Direction,
  type ExitReason,
  type Grade,
  type MistakeTag,
  type Setup,
  type Trade,
} from "@/lib/engine/types";
import { todayKey, uid, update, useAppState } from "@/lib/store";

const numOrNull = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const emptyEntry = {
  ticker: "",
  direction: "Long" as Direction,
  strategy: "" as Setup | "",
  entry: "",
  stop: "",
  target: "",
  shares: "",
  thesisGrade: "" as Grade | "",
  emotion: "3",
  thesis: "",
  exceptionNote: "",
};

const emptyClose = {
  exitDate: "",
  exitPrice: "",
  fees: "0",
  mfePct: "",
  maePct: "",
  exitReason: "" as ExitReason | "",
  mistakeTag: "None" as MistakeTag,
  ruleFollowed: "" as "Yes" | "No" | "",
  lesson: "",
  nextRuleChange: "" as "Yes" | "No" | "Review" | "",
  tags: "",
};

export default function JournalPage() {
  const state = useAppState();
  const gate = evaluateGate(state.gateInputs, state.settings, state.trades);
  const stats = journalStats(state.trades);
  const open = state.trades.filter((t) => t.status === "Open");
  const closed = state.trades.filter((t) => t.status === "Closed").slice().reverse();

  const [entry, setEntry] = useState(emptyEntry);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [closeForm, setCloseForm] = useState(emptyClose);
  const fileRef = useRef<HTMLInputElement>(null);

  const gateOpen = gate.state === "RISK ALLOWED";
  const suggested = computeSizing({
    portfolioValue: state.settings.portfolioValue,
    riskPerTradePct: state.settings.riskPerTradePct,
    entry: numOrNull(entry.entry),
    stop: numOrNull(entry.stop),
    target: numOrNull(entry.target),
    notionalCapPct: state.settings.notionalCapPct,
  });

  const logTrade = () => {
    if (!entry.ticker.trim() || numOrNull(entry.entry) === null || numOrNull(entry.stop) === null) {
            return;
    }
    if (!gateOpen && !entry.exceptionNote.trim()) {
      toast(`Gate is ${gate.state} — add an exception note.`, 'warning'); return;
      return;
    }
    const t: Trade = {
      id: uid("T"),
      status: "Open",
      gateAtEntry: gate.state,
      strategy: entry.strategy,
      ticker: entry.ticker.trim().toUpperCase(),
      direction: entry.direction,
      sleeve: "Satellite",
      entryDate: todayKey(),
      exitDate: "",
      entry: numOrNull(entry.entry),
      stop: numOrNull(entry.stop),
      target: numOrNull(entry.target),
      shares: numOrNull(entry.shares),
      exitPrice: null,
      fees: null,
      mfePct: null,
      maePct: null,
      thesisGrade: entry.thesisGrade,
      emotion: numOrNull(entry.emotion),
      ruleFollowed: "",
      exitReason: "",
      mistakeTag: "",
      thesis: entry.thesis,
      lesson: "",
      nextRuleChange: "",
      tags: "",
      exceptionNote: entry.exceptionNote.trim() || undefined,
    };
    update((prev) => ({ ...prev, trades: [...prev.trades, t] }));
    setEntry(emptyEntry);
    toast(`${t.ticker} logged — gate: ${t.gateAtEntry}`);
  };

  const startClose = (id: string) => {
    setClosingId(id);
    setCloseForm({ ...emptyClose, exitDate: todayKey() });
  };

  const commitClose = () => {
    if (!closingId) return;
    if (numOrNull(closeForm.exitPrice) === null || !closeForm.exitReason || !closeForm.ruleFollowed) {
      toast('Exit price, exit reason, and rule-followed are required.', 'warning'); return;
      return;
    }
    update((prev) => ({
      ...prev,
      trades: prev.trades.map((t) =>
        t.id === closingId
          ? {
              ...t,
              status: "Closed",
              exitDate: closeForm.exitDate || todayKey(),
              exitPrice: numOrNull(closeForm.exitPrice),
              fees: numOrNull(closeForm.fees) ?? 0,
              mfePct: numOrNull(closeForm.mfePct),
              maePct: numOrNull(closeForm.maePct),
              exitReason: closeForm.exitReason,
              mistakeTag: closeForm.mistakeTag,
              ruleFollowed: closeForm.ruleFollowed,
              lesson: closeForm.lesson,
              nextRuleChange: closeForm.nextRuleChange,
              tags: closeForm.tags,
            }
          : t,
      ),
    }));
    setClosingId(null);
    toast("Trade closed.");
  };

  const onImport = async (file: File) => {
    const text = await file.text();
    const trades = importJournalCsv(text);
    if (!trades.length) {
      toast('No rows recognised — check the file format.', 'error'); return;
      return;
    }
    update((prev) => ({ ...prev, trades: [...prev.trades, ...trades] }));
      };

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Closed / open" value={`${stats.closedCount} / ${stats.openCount}`} />
        <Stat label="Net P&L" value={fmtUsd(stats.netPnlUsd)} tone={stats.netPnlUsd >= 0 ? "good" : "bad"} />
        <Stat label="Expectancy" value={fmtR(stats.expectancyR)} tone="gate" />
        <Stat label="Profit factor" value={stats.profitFactor !== null ? `${stats.profitFactor.toFixed(2)}×` : "—"} />
        <Stat label="Win rate" value={fmtPct(stats.winRatePct, 0)} />
        <Stat label="Avg win / loss" value={`${fmtR(stats.avgWinR)} / ${fmtR(stats.avgLossR)}`} />
        <Stat label="Max R drawdown" value={stats.maxDrawdownR !== null ? `−${stats.maxDrawdownR.toFixed(2)}R` : "—"} />
        <Stat label="Rule adherence" value={fmtPct(stats.adherencePct, 0)} />
      </div>

      {stats.closedCount >= 2 && (
        <div className="grid gap-3 md:grid-cols-2">
          <Panel eyebrow="Cumulative R over time" title="Equity curve">
            <EquityCurve trades={state.trades} />
          </Panel>
          <Panel eyebrow="Trade outcome distribution" title="R distribution">
            <RDistribution trades={state.trades} />
          </Panel>
        </div>
      )}

      {(stats.leakFlags.length > 0 || stats.mistakeCounts.length > 0) && (
        <Panel eyebrow="Behavioral review" title="Mistake tags & leak flags">
          <p className="font-mono text-xs text-mut">
            {stats.mistakeCounts.map(([tag, n]) => `${tag} ×${n}`).join(" · ") || "no mistake tags yet"}
            {stats.leakFlags.length > 0 && (
              <>
                {" "}
                <span className="text-reduced">
                  | leaks: {stats.leakFlags.map(([tag, n]) => `${tag} ×${n}`).join(" · ")}
                </span>
              </>
            )}
          </p>
          <p className="mt-1 text-[11px] text-faint">
            Change a rule only when a repeated pattern is visible — one material change per monthly review.
          </p>
        </Panel>
      )}

      <Panel
        eyebrow={`Gate now: ${gate.state}`}
        title="Log a new trade"
        right={
          <span className="font-mono text-[11px] text-faint">
            gate is stamped on entry — it stays on the record forever
          </span>
        }
      >
        {!gateOpen && (
          <p className="mb-2 border border-reduced px-2 py-1.5 font-mono text-[11px] text-reduced">
            Gate is {gate.state}. Discipline says {gate.state === "NO NEW SWINGS" ? "manage existing positions only" : "reduced size or stand aside"} —
            logging anyway requires a documented exception.
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="grid gap-1 text-xs text-mut">
            Ticker
            <input className="field" value={entry.ticker} onChange={(e) => setEntry({ ...entry, ticker: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Direction
            <select className="field" value={entry.direction} onChange={(e) => setEntry({ ...entry, direction: e.target.value as Direction })}>
              <option>Long</option>
              <option>Short</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Setup / strategy
            <select className="field" value={entry.strategy} onChange={(e) => setEntry({ ...entry, strategy: e.target.value as Setup })}>
              <option value="">—</option>
              {SETUPS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Thesis grade (pre-trade)
            <select className="field" value={entry.thesisGrade} onChange={(e) => setEntry({ ...entry, thesisGrade: e.target.value as Grade })}>
              <option value="">—</option>
              {GRADES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Entry ($)
            <input className="field" inputMode="decimal" value={entry.entry} onChange={(e) => setEntry({ ...entry, entry: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Initial stop ($)
            <input className="field" inputMode="decimal" value={entry.stop} onChange={(e) => setEntry({ ...entry, stop: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Planned target ($)
            <input className="field" inputMode="decimal" value={entry.target} onChange={(e) => setEntry({ ...entry, target: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Shares{suggested.cappedShares !== null ? ` (risk math: ${suggested.cappedShares})` : ""}
            <input className="field" inputMode="numeric" value={entry.shares} placeholder={suggested.cappedShares !== null ? String(suggested.cappedShares) : ""} onChange={(e) => setEntry({ ...entry, shares: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut sm:col-span-3">
            Thesis (one or two sentences)
            <input className="field" value={entry.thesis} onChange={(e) => setEntry({ ...entry, thesis: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Conviction 1–5
            <input className="field" inputMode="numeric" value={entry.emotion} onChange={(e) => setEntry({ ...entry, emotion: e.target.value })} />
          </label>
          {!gateOpen && (
            <label className="grid gap-1 text-xs text-reduced sm:col-span-4">
              Documented exception (required while gate is {gate.state})
              <input className="field" value={entry.exceptionNote} onChange={(e) => setEntry({ ...entry, exceptionNote: e.target.value })} />
            </label>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" className="btn-gate" onClick={logTrade}>
            Log trade
          </button>
        </div>
      </Panel>

      <Panel eyebrow={`${open.length} open`} title="Open trades">
        {open.length === 0 ? (
          <p className="text-xs text-faint">No open trades. The ledger is the source of truth — log entries here, close them within 24 hours of exit.</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="eyebrow">
                <th className="cell font-normal">Ticker</th>
                <th className="cell font-normal">Dir</th>
                <th className="cell hidden font-normal sm:table-cell">Entry</th>
                <th className="cell hidden font-normal sm:table-cell">Stop</th>
                <th className="cell font-normal">Planned risk</th>
                <th className="cell hidden font-normal md:table-cell">Gate @ entry</th>
                <th className="cell font-normal" />
              </tr>
            </thead>
            <tbody>
              {open.map((t) => (
                <tr key={t.id} className="hover:bg-panel2">
                  <td className="cell">{t.ticker}</td>
                  <td className="cell text-mut">{t.direction}</td>
                  <td className="cell hidden text-mut sm:table-cell">{t.entry ?? "—"}</td>
                  <td className="cell hidden text-mut sm:table-cell">{t.stop ?? "—"}</td>
                  <td className="cell text-mut">{fmtUsd(plannedRiskUsd(t))}</td>
                  <td className="cell hidden text-faint md:table-cell">{t.gateAtEntry || "—"}</td>
                  <td className="cell">
                    <button type="button" className="btn" onClick={() => startClose(t.id)}>
                      Close
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {closingId && (
          <div className="mt-3 border border-line bg-panel2 p-3">
            <div className="eyebrow mb-2">Closed-trade debrief — complete within 24 hours of exit</div>
            <div className="grid gap-2 sm:grid-cols-4">
              <label className="grid gap-1 text-xs text-mut">
                Exit date
                <input className="field" value={closeForm.exitDate} onChange={(e) => setCloseForm({ ...closeForm, exitDate: e.target.value })} />
              </label>
              <label className="grid gap-1 text-xs text-mut">
                Exit price ($)
                <input className="field" inputMode="decimal" value={closeForm.exitPrice} onChange={(e) => setCloseForm({ ...closeForm, exitPrice: e.target.value })} />
              </label>
              <label className="grid gap-1 text-xs text-mut">
                Fees / slippage ($)
                <input className="field" inputMode="decimal" value={closeForm.fees} onChange={(e) => setCloseForm({ ...closeForm, fees: e.target.value })} />
              </label>
              <label className="grid gap-1 text-xs text-mut">
                Rule followed?
                <select className="field" value={closeForm.ruleFollowed} onChange={(e) => setCloseForm({ ...closeForm, ruleFollowed: e.target.value as "Yes" | "No" })}>
                  <option value="">—</option>
                  <option>Yes</option>
                  <option>No</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs text-mut">
                MFE (%)
                <input className="field" inputMode="decimal" value={closeForm.mfePct} onChange={(e) => setCloseForm({ ...closeForm, mfePct: e.target.value })} />
              </label>
              <label className="grid gap-1 text-xs text-mut">
                MAE (%)
                <input className="field" inputMode="decimal" value={closeForm.maePct} onChange={(e) => setCloseForm({ ...closeForm, maePct: e.target.value })} />
              </label>
              <label className="grid gap-1 text-xs text-mut">
                Exit reason
                <select className="field" value={closeForm.exitReason} onChange={(e) => setCloseForm({ ...closeForm, exitReason: e.target.value as ExitReason })}>
                  <option value="">—</option>
                  {EXIT_REASONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-mut">
                Mistake tag (one primary)
                <select className="field" value={closeForm.mistakeTag} onChange={(e) => setCloseForm({ ...closeForm, mistakeTag: e.target.value as MistakeTag })}>
                  {MISTAKE_TAGS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-mut sm:col-span-3">
                Lesson — one falsifiable sentence
                <input className="field" value={closeForm.lesson} onChange={(e) => setCloseForm({ ...closeForm, lesson: e.target.value })} />
              </label>
              <label className="grid gap-1 text-xs text-mut">
                Next rule change?
                <select className="field" value={closeForm.nextRuleChange} onChange={(e) => setCloseForm({ ...closeForm, nextRuleChange: e.target.value as "Yes" | "No" | "Review" })}>
                  <option value="">—</option>
                  <option>No</option>
                  <option>Review</option>
                  <option>Yes</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs text-mut sm:col-span-4">
                Tags (semicolon-separated; leaks like moved-stop, fomo-entry, cut-winner-early are auto-flagged)
                <input className="field" value={closeForm.tags} onChange={(e) => setCloseForm({ ...closeForm, tags: e.target.value })} />
              </label>
            </div>
            <div className="mt-2 flex gap-2">
              <button type="button" className="btn-gate" onClick={commitClose}>
                Close trade
              </button>
              <button type="button" className="btn" onClick={() => setClosingId(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Panel>

      <Panel
        eyebrow={`${closed.length} closed`}
        title="Closed trades"
        right={
          <div className="flex gap-2">
            <button type="button" className="btn" onClick={() => downloadText("trading-journal.csv", exportJournalCsv(state.trades))}>
              Export ledger CSV
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Import ledger CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImport(f);
                e.target.value = "";
              }}
            />
          </div>
        }
      >
        {closed.length === 0 ? (
          <p className="text-xs text-faint">Every closed trade becomes a comparable data point. Export/import uses the companion skill&apos;s exact 16-column ledger format.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="eyebrow">
                  <th className="cell font-normal">Ticker</th>
                  <th className="cell font-normal">R</th>
                  <th className="cell font-normal">Net P&L</th>
                  <th className="cell hidden font-normal sm:table-cell">Exit</th>
                  <th className="cell hidden font-normal sm:table-cell">Mistake</th>
                  <th className="cell hidden font-normal md:table-cell">Rule</th>
                  <th className="cell hidden font-normal lg:table-cell">Lesson</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((t) => {
                  const r = rMultiple(t);
                  const n = netPnl(t);
                  return (
                    <tr key={t.id} className="hover:bg-panel2">
                      <td className="cell">{t.ticker}</td>
                      <td className="cell font-semibold" style={{ color: r !== null && r >= 0 ? "#2FBF8F" : "#E5484D" }}>
                        {fmtR(r)}
                      </td>
                      <td className="cell text-mut">{fmtUsd(n)}</td>
                      <td className="cell hidden text-mut sm:table-cell">{t.exitReason || "—"}</td>
                      <td className="cell hidden text-mut sm:table-cell">{t.mistakeTag || "—"}</td>
                      <td className="cell hidden sm:table-cell" style={{ color: t.ruleFollowed === "Yes" ? "#2FBF8F" : t.ruleFollowed === "No" ? "#E5484D" : undefined }}>
                        {t.ruleFollowed || "—"}
                      </td>
                      <td className="cell hidden max-w-64 truncate text-faint lg:table-cell">{t.lesson || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
