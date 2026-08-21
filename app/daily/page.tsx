"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Check, CircleHelp, Clock3, Pause, Play,
  RotateCcw, ShieldCheck, TriangleAlert, LockKeyhole,
} from "lucide-react";
import { toast } from "@/components/toast";
import { suggestPermittedAction } from "@/lib/engine/action";
import { evaluateGate } from "@/lib/engine/gate";
import { DAILY_BLOCKS, type BlockStatus, type DailyCheck } from "@/lib/engine/types";
import { todayKey, update, useAppState } from "@/lib/store";

const QUESTIONS: Record<string, { question: string; help: string; normal: string; attention: string }> = {
  risk: {
    question: "Are today's risk conditions understood?",
    help: "Start here. AXIOM checks the market backdrop and your own risk budget before you look for new swing trades.",
    normal: "The saved risk check is current and I understand today's limits.",
    attention: "Something in the risk check needs updating or a closer look.",
  },
  market: {
    question: "Has the broad market picture meaningfully changed?",
    help: "You are not trying to predict the next move. Just notice whether the market backdrop has clearly improved, weakened or stayed broadly the same.",
    normal: "Nothing important has changed since my last check.",
    attention: "The market backdrop has changed enough to affect how cautious I should be.",
  },
  events: {
    question: "Is there a known event that could change an existing risk?",
    help: "Think earnings, central-bank decisions, court rulings or other scheduled events connected to holdings or open trades. Ignore general news that does not change a decision.",
    normal: "No known event needs action today.",
    attention: "An event could affect a holding or open trade and needs a decision.",
  },
  positions: {
    question: "Does anything you already own need attention?",
    help: "Check open swing positions and long-term holdings for broken rules, invalidations, stops, payouts or a genuine thesis change.",
    normal: "My existing positions are behaving within the plans I already wrote.",
    attention: "At least one existing position needs a closer review.",
  },
  candidates: {
    question: "Are you allowed to review new swing-trade ideas today?",
    help: "New ideas come last. Only review your existing approved ideas when the risk check allows active risk.",
    normal: "Risk is allowed and I may review the ideas already on my list.",
    attention: "I am not taking new swing risk today.",
  },
};

export default function DailyPage() {
  const state = useAppState();
  const gate = evaluateGate(state.gateInputs, state.settings, state.trades);
  const today = todayKey();
  const saved = state.dailyChecks[today];
  const [blocks, setBlocks] = useState(() => saved?.blocks ?? DAILY_BLOCKS.map((b) => ({ id: b.id, status: "Not Started" as BlockStatus, note: "" })));
  const suggestion = suggestPermittedAction(gate, state.trades);
  const [action, setAction] = useState(saved?.action ?? suggestion.action);
  const [because, setBecause] = useState(saved?.because ?? suggestion.because);
  const firstIncomplete = Math.max(0, DAILY_BLOCKS.findIndex((spec) => (saved?.blocks ?? []).find((b) => b.id === spec.id)?.status === "Not Started"));
  const [step, setStep] = useState(firstIncomplete < 0 ? DAILY_BLOCKS.length - 1 : firstIncomplete);

  const [secondsLeft, setSecondsLeft] = useState(15 * 60);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!running || secondsLeft === 0) return;
    timer.current = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [running, secondsLeft]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const completeCount = blocks.filter((b) => b.status !== "Not Started").length;
  const locked = gate.state === "NO NEW SWINGS";
  const spec = DAILY_BLOCKS[step];
  const current = blocks.find((b) => b.id === spec.id)!;
  const copy = QUESTIONS[spec.id];
  const isLast = step === DAILY_BLOCKS.length - 1;
  const allAnswered = completeCount === DAILY_BLOCKS.length;

  const resultText = useMemo(() => {
    if (gate.state === "RISK ALLOWED") return "You may review existing swing-trade ideas after you finish checking current positions.";
    if (gate.state === "REDUCED RISK ONLY") return "Today calls for smaller risk or standing aside. Any exception should be written down before a trade is planned.";
    return "Do not look for new swing trades today. Manage what you already own and finish the check.";
  }, [gate.state]);

  const setBlock = (id: string, patch: Partial<{ status: BlockStatus; note: string }>) =>
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const choose = (status: BlockStatus) => {
    if (spec.id === "candidates" && locked && status === "Done") return;
    setBlock(spec.id, { status });
  };

  const next = () => {
    if (step < DAILY_BLOCKS.length - 1) setStep((s) => s + 1);
  };

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
    toast("Today's check is saved");
  };

  return (
    <div>
      <header className="page-intro mb-8">
        <div className="page-kicker">Your 15-minute routine</div>
        <h1>Let's do today's check.</h1>
        <p>Five simple questions. You are looking for exceptions—not reasons to trade. When the check is finished, stop browsing the market.</p>
      </header>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-y border-line py-4">
        <div className="flex items-center gap-3">
          <Clock3 size={18} className="text-faint" />
          <div>
            <div className="text-sm font-semibold">Question {step + 1} of {DAILY_BLOCKS.length}</div>
            <div className="text-xs text-faint">{completeCount} answered</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="min-w-[68px] font-mono text-lg tabular-nums text-volt">{mm}:{ss}</span>
          <button type="button" className="btn-ghost" onClick={() => setRunning((r) => !r)}>{running ? <Pause size={15} /> : <Play size={15} />}{running ? "Pause" : secondsLeft === 15 * 60 ? "Start timer" : "Resume"}</button>
          {secondsLeft !== 15 * 60 && <button type="button" className="btn-ghost p-2" onClick={() => { setRunning(false); setSecondsLeft(15 * 60); }} aria-label="Reset timer"><RotateCcw size={15} /></button>}
        </div>
      </div>

      <div className="mb-6 flex gap-2" aria-label="Daily check progress">
        {DAILY_BLOCKS.map((b, i) => {
          const block = blocks.find((x) => x.id === b.id)!;
          return <button key={b.id} type="button" onClick={() => setStep(i)} className={`h-2 flex-1 rounded-full transition-colors ${i === step ? "bg-volt" : block.status !== "Not Started" ? "bg-panel2" : "bg-[#27312B]"}`} aria-label={`Go to question ${i + 1}`} />;
        })}
      </div>

      <section className="mx-auto max-w-3xl py-6 sm:py-10">
        <div className="text-sm font-semibold text-[#9a6b4b]">{spec.time} · {spec.title}</div>
        <h2 className="mt-3 font-display text-[1.55rem] font-semibold leading-[1.04] tracking-[-0.04em] sm:text-[2rem]">{copy.question}</h2>
        <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-mut">{copy.help}</p>

        {spec.id === "risk" && (
          <div className="mt-7 rounded-[18px] bg-panel p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck size={20} className="mt-0.5 shrink-0 text-faint" />
              <div>
                <div className="font-semibold">Current answer from your risk check</div>
                <p className="mt-1 text-sm leading-relaxed text-mut">{resultText}</p>
                <Link href="/gate" className="quiet-link mt-3">Open the risk check <ArrowRight size={14} /></Link>
              </div>
            </div>
          </div>
        )}

        {spec.id === "candidates" && locked && (
          <div className="mt-7 flex items-start gap-3 rounded-[18px] bg-[#241111] p-5">
            <LockKeyhole size={20} className="mt-0.5 shrink-0 text-[#F4645C]" />
            <div><div className="font-semibold">New trade ideas are closed today.</div><p className="mt-1 text-sm text-mut">Your current risk check says no new swings. AXIOM will not ask you to scan candidates.</p></div>
          </div>
        )}

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <button type="button" onClick={() => choose("Done")} disabled={spec.id === "candidates" && locked} className={`text-left rounded-[18px] border p-5 transition ${current.status === "Done" ? "border-line bg-panel" : "border-line bg-panel2 hover:border-line"}`}>
            <Check size={20} className="text-[#34D399]" />
            <div className="mt-3 font-semibold">Looks normal</div>
            <p className="mt-1 text-xs leading-relaxed text-mut">{copy.normal}</p>
          </button>
          <button type="button" onClick={() => choose("Exception")} className={`text-left rounded-[18px] border p-5 transition ${current.status === "Exception" ? "border-[#F4645C] bg-[#241111]" : "border-line bg-panel2 hover:border-[#F4645C]"}`}>
            <TriangleAlert size={20} className="text-[#F4645C]" />
            <div className="mt-3 font-semibold">Needs attention</div>
            <p className="mt-1 text-xs leading-relaxed text-mut">{copy.attention}</p>
          </button>
          <button type="button" onClick={() => choose("Not Started")} className={`text-left rounded-[18px] border p-5 transition ${current.status === "Not Started" ? "border-line bg-panel2" : "border-line bg-panel2 hover:border-line"}`}>
            <CircleHelp size={20} className="text-faint" />
            <div className="mt-3 font-semibold">Not sure yet</div>
            <p className="mt-1 text-xs leading-relaxed text-mut">Leave this unanswered until you have checked the fact you need.</p>
          </button>
        </div>

        {(current.status === "Exception" || current.note) && (
          <label className="mt-6 block">
            <span className="field-label">What changed or needs attention?</span>
            <textarea className="field min-h-28" value={current.note} onChange={(e) => setBlock(spec.id, { note: e.target.value })} placeholder="One short note is enough. Write the fact, not a market story." />
          </label>
        )}

        <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
          <button type="button" className="btn-ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}><ArrowLeft size={15} /> Back</button>
          {!isLast ? (
            <button type="button" className="btn-primary" onClick={next}>Next question <ArrowRight size={15} /></button>
          ) : (
            <button type="button" className="btn-primary" onClick={() => document.getElementById("daily-answer")?.scrollIntoView({ behavior: "smooth" })}>Finish the check <ArrowRight size={15} /></button>
          )}
        </div>
      </section>

      <section id="daily-answer" className="mt-8 border-t border-line pt-10">
        <div className="max-w-3xl">
          <div className="page-kicker">End with one clear sentence</div>
          <h2 className="mt-2 font-display text-[2.25rem] font-semibold leading-[1.06] tracking-[-0.04em]">What are you actually allowed to do today?</h2>
          <p className="mt-3 text-sm leading-relaxed text-mut">AXIOM has suggested an answer from your saved risk check. Edit it only when a real fact from today's review changes the wording.</p>
          <div className="mt-6 grid gap-4">
            <label><span className="field-label">Today's permitted action is…</span><input className="field" value={action} onChange={(e) => setAction(e.target.value)} /></label>
            <label><span className="field-label">…because</span><textarea className="field min-h-24" value={because} onChange={(e) => setBecause(e.target.value)} /></label>
          </div>
          {!allAnswered && <p className="mt-4 text-sm font-semibold text-[#F0B429]">{DAILY_BLOCKS.length - completeCount} question{DAILY_BLOCKS.length - completeCount === 1 ? " is" : "s are"} still unanswered. Unknowns should stay visible rather than being treated as clear.</p>}
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <button type="button" className="btn-primary" onClick={save}>Save today's check <Check size={16} /></button>
            <span className="text-sm text-mut">After saving, no further market browsing is required unless a real exception appears.</span>
          </div>
        </div>
      </section>
    </div>
  );
}
