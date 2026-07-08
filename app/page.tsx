"use client";

import Link from "next/link";
import {
  ArrowRight, Check, Circle, Clock3, Leaf, NotebookPen, PieChart,
  ShieldCheck, Sparkles, CalendarDays, Lightbulb, CircleCheckBig,
} from "lucide-react";
import { fmtPct, fmtUsd } from "@/components/chrome";
import { demoState } from "@/lib/backup";
import { suggestPermittedAction } from "@/lib/engine/action";
import { evaluateGate, openPlannedRiskUsd } from "@/lib/engine/gate";
import { journalStats, portfolioStats } from "@/lib/engine/stats";
import { isoWeekKey, replaceState, todayKey, useAppState } from "@/lib/store";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Working late.";
  if (h < 12) return "Good morning.";
  if (h < 18) return "Good afternoon.";
  return "Good evening.";
}

function niceDate(dateKey: string) {
  const d = new Date(`${dateKey}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

function plainAction(action: string) {
  const upper = action.toUpperCase();
  if (upper.includes("NO NEW") || upper.includes("MANAGE")) return "Focus on what you already own today.";
  if (upper.includes("REDUCED")) return "New swing trades need extra caution today.";
  if (upper.includes("REVIEW SWING") || upper.includes("CANDIDATE")) return "You may review swing-trade ideas today.";
  return action.charAt(0).toUpperCase() + action.slice(1).toLowerCase();
}

export default function TodayPage() {
  const state = useAppState();
  const gate = evaluateGate(state.gateInputs, state.settings, state.trades);
  const js = journalStats(state.trades);
  const ps = portfolioStats(state.holdings);
  const today = todayKey();
  const todaysCheck = state.dailyChecks[today];
  const suggestion = suggestPermittedAction(gate, state.trades);
  const action = todaysCheck?.action || suggestion.action;
  const because = todaysCheck?.because || suggestion.because;

  const empty = js.closedCount === 0 && js.openCount === 0 && state.holdings.length === 0 && state.watchRules.length === 0 && state.monthly.length === 0 && Object.keys(state.dailyChecks).length === 0;
  const weekDone = state.weeklyReviews.includes(isoWeekKey());
  const monthTag = today.slice(0, 7);
  const monthDone = state.monthly.some((m) => m.monthStart.startsWith(monthTag) && m.endingValue !== null);
  const dueJournal = state.trades.filter((t) => t.status === "Closed" && (!t.lesson || !t.ruleFollowed)).length;
  const openRisk = openPlannedRiskUsd(state.trades);
  const openRiskPct = state.settings.portfolioValue > 0 ? (openRisk / state.settings.portfolioValue) * 100 : 0;

  const steps = [
    {
      done: Boolean(todaysCheck),
      title: "Do today's 15-minute check",
      text: "Check conditions, existing positions and anything that genuinely changed.",
      href: "/daily",
      cta: todaysCheck ? "Review today's note" : "Start the check",
      Icon: Clock3,
    },
    {
      done: dueJournal === 0,
      title: dueJournal ? `Reflect on ${dueJournal} closed trade${dueJournal === 1 ? "" : "s"}` : "Trade reflections are up to date",
      text: dueJournal ? "A result is only useful after you record what the decision taught you." : "Nothing is waiting for a journal reflection.",
      href: "/journal",
      cta: dueJournal ? "Open the journal" : "View journal",
      Icon: NotebookPen,
    },
    {
      done: weekDone,
      title: weekDone ? "This week's portfolio review is done" : "Review your long-term portfolio this week",
      text: "Check the reason you own each holding, weight drift and income quality—not daily price noise.",
      href: "/portfolio",
      cta: weekDone ? "View portfolio" : "Start weekly review",
      Icon: PieChart,
    },
  ];

  const firstOpen = steps.find((s) => !s.done) ?? steps[0];

  return (
    <div>
      <header className="page-intro">
        <div className="page-kicker">{niceDate(today)}</div>
        <h1>{empty ? "A calmer way to invest." : greeting()}</h1>
        <p>{empty ? "AXIOM helps you follow a simple routine: check risk, look after what you own, take new trades only when your rules allow them, and learn from every result." : "You do not need to follow everything happening in the market. Start with the one decision your process needs today."}</p>
      </header>

      {empty ? (
        <>
          <section className="mb-8 rounded-[26px] bg-[#EFF6F1] p-6 sm:p-9">
            <div className="max-w-2xl">
              <span className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#B4F03C] text-[#f5e9d5]"><Leaf size={21} /></span>
              <h2 className="font-display text-[2.15rem] font-semibold leading-[1.05] tracking-[-0.04em] text-[#243d33] sm:text-[3rem]">Start with a routine, not a watchlist.</h2>
              <p className="mt-4 text-[16px] leading-relaxed text-[#607067]">Tell AXIOM about your portfolio and starting risk limits. From there, it guides you through a 15-minute daily check, a weekly portfolio review and a monthly learning loop.</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link className="btn-primary" href="/settings">Set up AXIOM <ArrowRight size={16} /></Link>
                <button type="button" className="btn" onClick={() => replaceState(demoState())}>See a filled-in example</button>
              </div>
            </div>
          </section>

          <section className="mb-10 grid gap-7 md:grid-cols-3">
            {[
              ["1", "Check before you act", "Answer a few simple questions before looking for new swing trades."],
              ["2", "Look after what you own", "Review holdings on a schedule instead of reacting to every market move."],
              ["3", "Learn from real decisions", "Close every trade with a short reflection and review patterns once a month."],
            ].map(([n, title, text]) => (
              <div key={n} className="border-t border-[#3A453E] pt-5">
                <div className="text-sm font-bold text-[#a16b4c]">{n}</div>
                <h3 className="mt-3 font-display text-2xl font-semibold tracking-[-0.025em]">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-mut">{text}</p>
              </div>
            ))}
          </section>
        </>
      ) : (
        <>
          <section className="mb-10 grid gap-7 border-b border-[#27312B] pb-10 lg:grid-cols-[1.45fr_.55fr] lg:items-end">
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#9FB0A6]"><ShieldCheck size={17} /> Today's answer</div>
              <h2 className="max-w-3xl font-display text-[2.35rem] font-semibold leading-[1.06] tracking-[-0.04em] sm:text-[3.6rem]">{plainAction(action)}</h2>
              <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-mut">{because ? `Why: ${because}.` : "Complete today's check to see what your rules permit."}</p>
              <Link href={todaysCheck ? firstOpen.href : "/daily"} className="btn-primary mt-7">
                {todaysCheck ? firstOpen.cta : "Start today's 15-minute check"} <ArrowRight size={16} />
              </Link>
            </div>
            <div className="rounded-[20px] bg-[#151B17] p-5">
              <div className="text-sm font-semibold text-[#9FB0A6]">Risk check</div>
              <div className="mt-2 font-display text-[1.75rem] font-semibold tracking-[-0.03em]">{gate.checks.filter((c) => c.pass).length} of {gate.checks.length} checks are clear</div>
              <p className="mt-2 text-sm leading-relaxed text-mut">{state.gateInputs.asOf ? "The latest saved risk conditions are being used." : "Market conditions still need to be updated."}</p>
              <Link href="/gate" className="quiet-link mt-4">See what AXIOM checked <ArrowRight size={14} /></Link>
            </div>
          </section>

          <section className="mb-12">
            <div className="mb-6">
              <div className="page-kicker">Start here</div>
              <h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em] sm:text-[2.6rem]">Your next few steps</h2>
            </div>
            <div className="divide-y divide-[#27312B] border-y border-[#27312B]">
              {steps.map(({ done, title, text, href, cta, Icon }, index) => (
                <Link href={href} key={title} className="group grid gap-4 py-6 sm:grid-cols-[48px_1fr_auto] sm:items-center">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-full ${done ? "bg-[#10241C] text-[#34D399]" : index === steps.findIndex((s) => !s.done) ? "bg-[#B4F03C] text-[#0B0F0D]" : "bg-[#1A211D] text-[#77897E]"}`}>
                    {done ? <Check size={18} strokeWidth={2.4} /> : <Icon size={18} />}
                  </span>
                  <span>
                    <span className="block text-[17px] font-semibold text-ink">{title}</span>
                    <span className="mt-1 block max-w-2xl text-sm leading-relaxed text-mut">{text}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 text-sm font-bold text-[#315e4d] group-hover:underline">{cta} <ArrowRight size={14} /></span>
                </Link>
              ))}
            </div>
          </section>

          <section className="mb-12">
            <div className="page-kicker">Your rhythm</div>
            <h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">A simple routine</h2>
            <div className="mt-6 grid gap-6 md:grid-cols-3">
              <div className="border-l-2 border-[#769184] pl-5">
                <Clock3 size={19} className="text-[#49695a]" />
                <h3 className="mt-3 text-lg font-semibold">Today</h3>
                <p className="mt-2 text-sm leading-relaxed text-mut">Spend 15 minutes checking risk, events and existing positions. Stop when the check is done.</p>
                <Link href="/daily" className="quiet-link mt-3">Daily check</Link>
              </div>
              <div className="border-l-2 border-[#F0B429] pl-5">
                <CalendarDays size={19} className="text-[#9b7435]" />
                <h3 className="mt-3 text-lg font-semibold">This week</h3>
                <p className="mt-2 text-sm leading-relaxed text-mut">Review long-term holdings once. Decide whether anything has changed enough to act.</p>
                <Link href="/portfolio" className="quiet-link mt-3">Portfolio review</Link>
              </div>
              <div className="border-l-2 border-[#bc8068] pl-5">
                <Sparkles size={19} className="text-[#a45e45]" />
                <h3 className="mt-3 text-lg font-semibold">This month</h3>
                <p className="mt-2 text-sm leading-relaxed text-mut">Compare results with your benchmark, look for repeated mistakes and change at most one rule.</p>
                <Link href="/monthly" className="quiet-link mt-3">Monthly review</Link>
              </div>
            </div>
          </section>

          <section className="mb-10 rounded-[22px] bg-[#fffdf8]/70 px-6 py-6 sm:px-8">
            <div className="flex items-start gap-4">
              <Lightbulb size={21} className="mt-1 shrink-0 text-[#a16b4c]" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-ink">A few useful numbers—not a scoreboard</div>
                <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <div><div className="text-xs font-semibold text-faint">Portfolio value</div><div className="mt-1 text-xl font-semibold">{fmtUsd(ps.totalMarketValue)}</div></div>
                  <div><div className="text-xs font-semibold text-faint">Forward income</div><div className="mt-1 text-xl font-semibold">{fmtUsd(ps.forwardIncome)}</div></div>
                  <div><div className="text-xs font-semibold text-faint">Open swing risk</div><div className="mt-1 text-xl font-semibold">{fmtPct(openRiskPct, 2)}</div></div>
                  <div><div className="text-xs font-semibold text-faint">Closed trades</div><div className="mt-1 text-xl font-semibold">{js.closedCount}</div></div>
                </div>
              </div>
            </div>
          </section>

          {!monthDone && (
            <div className="flex items-start gap-4 border-t border-[#27312B] pt-7">
              <CircleCheckBig size={20} className="mt-1 shrink-0 text-[#49695a]" />
              <div>
                <div className="font-semibold">The goal is not to keep AXIOM open.</div>
                <p className="mt-1 text-sm leading-relaxed text-mut">When today's check is complete and nothing needs attention, closing the site is the correct next step.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
