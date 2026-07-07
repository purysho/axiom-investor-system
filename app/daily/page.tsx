"use client";

import { useEffect, useRef, useState } from "react";
import { fmtPct, Panel } from "@/components/chrome";
import { toast } from "@/components/toast";
import { suggestPermittedAction } from "@/lib/engine/action";
import { evaluateGate } from "@/lib/engine/gate";
import { DAILY_BLOCKS, type BlockStatus, type DailyCheck } from "@/lib/engine/types";
import { todayKey, update, useAppState } from "@/lib/store";

const STATUSES: BlockStatus[] = ["Not Started", "Done", "Exception"];

export default function DailyPage() {
  const state = useAppState();
  const gate = evaluateGate(state.gateInputs, state.settings, state.trades);
  const today = todayKey();
  const saved = state.dailyChecks[today];

  const [blocks, setBlocks] = useState(
    () =>
      saved?.blocks ??
      DAILY_BLOCKS.map((b) => ({ id: b.id, status: "Not Started" as BlockStatus, note: "" })),
  );
  const suggestion = suggestPermittedAction(gate, state.trades);
  const [action, setAction] = useState(saved?.action ?? "");
  const [because, setBecause] = useState(saved?.because ?? "");

  // 15:00 countdown
  const [secondsLeft, setSecondsLeft] = useState(15 * 60);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!running) return;
    if (secondsLeft === 0) {
      setRunning(false);
      return;
    }
    timer.current = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [running, secondsLeft === 0]);
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  const locked = gate.state === "NO NEW SWINGS";
  const vixTxt = state.gateInputs.vix !== null ? state.gateInputs.vix.toFixed(2) : "awaiting data";
  const trendTxt =
    state.gateInputs.benchAbove200dma === null
      ? "awaiting data"
      : state.gateInputs.benchAbove200dma
        ? "above 200-DMA"
        : "below 200-DMA";
  const openCount = state.trades.filter((t) => t.status === "Open").length;

  const setBlock = (id: string, patch: Partial<{ status: BlockStatus; note: string }>) =>
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const save = () => {
    const check: DailyCheck = {
      date: today,
      gateState: gate.state,
      blocks,
      action: action || suggestion.action,
      because: because || suggestion.because,
      savedAt: new Date().toISOString(),
    };
    update((prev) => ({ ...prev, dailyChecks: { ...prev.dailyChecks, [today]: check } }));
    toast("Daily check saved");
  };

  return (
    <div className="grid gap-3">
      <Panel
        eyebrow={today}
        title="15-minute daily market check"
        right={
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg tabular-nums" style={{ color: secondsLeft === 0 ? "#E5484D" : "var(--gate)" }}>
              {mm}:{ss}
            </span>
            <button type="button" className="btn" onClick={() => setRunning((r) => !r)}>
              {running ? "Pause" : secondsLeft === 15 * 60 ? "Start" : "Resume"}
            </button>
            {secondsLeft !== 15 * 60 && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setRunning(false);
                  setSecondsLeft(15 * 60);
                }}
              >
                Reset
              </button>
            )}
          </div>
        }
      >
        <p className="text-xs text-mut">
          An exception-detection routine, not a miniature research day. Candidate scanning is forbidden when the
          Risk Gate does not permit it.
        </p>
      </Panel>

      {DAILY_BLOCKS.map((spec) => {
        const b = blocks.find((x) => x.id === spec.id);
        if (!b) return null;
        const isCandidates = spec.id === "candidates";
        const blockLocked = isCandidates && locked;
        return (
          <Panel key={spec.id} eyebrow={spec.time} title={spec.title} className="relative">
            <div className={blockLocked ? "select-none opacity-30" : ""} inert={blockLocked || undefined}>
              <p className="text-xs text-mut">{spec.objective}</p>
              {spec.id === "risk" && (
                <p className="mt-1 font-mono text-xs" style={{ color: "var(--gate)" }}>
                  Gate: {gate.state} · {gate.fails} failing · {gate.unknowns} awaiting data
                </p>
              )}
              {spec.id === "market" && (
                <p className="mt-1 font-mono text-xs text-mut">
                  {state.settings.benchmarkName}: {trendTxt} · VIX {vixTxt}
                </p>
              )}
              {spec.id === "positions" && (
                <p className="mt-1 font-mono text-xs text-mut">
                  {openCount} open trade{openCount === 1 ? "" : "s"} · open planned risk{" "}
                  {fmtPct(
                    state.settings.portfolioValue > 0
                      ? (state.trades
                          .filter((t) => t.status === "Open")
                          .reduce(
                            (a, t) =>
                              a +
                              (t.entry !== null && t.stop !== null && t.shares !== null
                                ? Math.abs(t.entry - t.stop) * t.shares
                                : 0),
                            0,
                          ) /
                          state.settings.portfolioValue) *
                          100
                      : 0,
                    2,
                  )}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="flex gap-px" role="group" aria-label={`${spec.title} status`}>
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setBlock(spec.id, { status: s })}
                      className={`border px-2 py-1 font-mono text-[11px] ${
                        b.status === s ? "border-[var(--gate)] text-ink" : "border-line text-mut hover:text-ink"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <input
                  className="field min-w-40 flex-1"
                  placeholder="Notes / exceptions"
                  value={b.note}
                  onChange={(e) => setBlock(spec.id, { note: e.target.value })}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-faint">Decision rule: {spec.rule}</p>
            </div>
            {blockLocked && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="border border-closed px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-closed">
                  Locked — gate says no new swings
                </div>
              </div>
            )}
          </Panel>
        );
      })}

      <Panel eyebrow="Required daily output" title="Permitted action">
        <div className="grid gap-2">
          <label className="grid gap-1 text-xs text-mut">
            Today&apos;s permitted action is…
            <input className="field" value={action} placeholder={suggestion.action} onChange={(e) => setAction(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            …because
            <input className="field" value={because} placeholder={suggestion.because} onChange={(e) => setBecause(e.target.value)} />
          </label>
          <div className="flex items-center gap-3">
            <button type="button" className="btn-gate" onClick={save}>
              Save today&apos;s check
            </button>
  
            {saved && (
              <span className="font-mono text-[11px] text-faint">last saved {new Date(saved.savedAt).toLocaleTimeString()}</span>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
