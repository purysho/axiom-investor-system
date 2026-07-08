"use client";

import Link from "next/link";
import {
  ArrowRight, BookOpen, Check, ChevronDown, CircleHelp, Gauge, HeartPulse,
  Lightbulb, NotebookPen, PieChart, ShieldCheck, Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const LESSONS: Array<{
  id: string;
  number: string;
  title: string;
  question: string;
  Icon: LucideIcon;
  summary: string;
  body: React.ReactNode;
  href?: string;
  cta?: string;
}> = [
  {
    id: "method", number: "01", title: "The AXIOM method", question: "What am I actually trying to do?", Icon: Sparkles,
    summary: "Build a repeatable investing routine that separates long-term compounding from measured swing risk.",
    body: <><p>AXIOM is built around a simple order: <strong>check risk, look after what you already own, review new ideas only when risk is allowed, record the decision, then learn from the outcome.</strong></p><p>Your long-term portfolio and swing trading are not one undifferentiated pot of decisions. Long-term holdings have roles, theses and benchmarks. Swing trades have planned risk, an invalidation and a journal record.</p><p>A profitable rule violation is still poor process. A losing trade that followed the plan can still be good process. That separation is how the journal becomes useful instead of emotional.</p></>,
  },
  {
    id: "risk", number: "02", title: "The risk check", question: "Why check risk before looking for trades?", Icon: ShieldCheck,
    summary: "Because the easiest time to rationalise risk is after you have already found a stock you want to trade.",
    body: <><p>The risk check deliberately comes before trade ideas. It asks six questions about the broad market trend, volatility, financial conditions, your own drawdown, your current swing-risk budget and unaccepted event risk.</p><p>The result is permission, not prediction. <strong>Risk allowed</strong> means you may review ideas under your normal rules. <strong>Reduced risk</strong> means smaller size or standing aside. <strong>No new swings</strong> means manage what you already own.</p><p>Unknown information is not treated as good news. An unresolved check stays unresolved until the fact is known.</p></>, href: "/gate", cta: "Open the risk check",
  },
  {
    id: "daily", number: "03", title: "The 15-minute daily check", question: "What should I look at every day?", Icon: HeartPulse,
    summary: "Only facts that can change today's permitted action or require attention in something you already own.",
    body: <><p>The daily check is five questions: are risk conditions understood; has the broad market picture materially changed; is there a known event that affects an existing risk; does anything you own need attention; and are you allowed to review new swing ideas?</p><p>This is <strong>exception detection, not research</strong>. If nothing changed, “looks normal” is the correct answer. The check ends with one sentence: “Today's permitted action is ___ because ___.”</p><p>Once the sentence is saved, no further market browsing is required unless a real exception appears.</p></>, href: "/daily", cta: "Do today's check",
  },
  {
    id: "portfolio", number: "04", title: "The weekly portfolio review", question: "How do I stop reacting to every price move?", Icon: PieChart,
    summary: "Review long-term holdings on a schedule and ask whether the reason for owning them has actually changed.",
    body: <><p>Once a week, make sure the holdings list is accurate. Then ask why each holding is still in the portfolio, whether its role and thesis remain intact, and whether concentration or income quality need attention.</p><p>For dividend holdings, yield is not a quality grade. Review coverage, balance-sheet resilience and the distribution trend. For ETFs, review the mandate, index fit, cost, concentration and overlap.</p><p>Finish with no more than three actions. <strong>Hold is a decision. No action is valid.</strong></p></>, href: "/portfolio", cta: "Review my portfolio",
  },
  {
    id: "sizing", number: "05", title: "Position sizing", question: "How much should I trade?", Icon: Gauge,
    summary: "Start with the loss you are prepared to accept if the planned stop is reached, then work backwards to shares.",
    body: <><p>One R is your planned loss budget for a trade. If the portfolio is $100,000 and risk per trade is 0.5%, one R is $500.</p><p>Suppose the entry is $50 and the initial stop is $47.50. The planned risk is $2.50 per share. A $500 risk budget divided by $2.50 gives 200 shares, before any single-position cap is applied.</p><p><strong>Planned risk is not a guaranteed maximum loss.</strong> A price can gap through a stop, execution can slip, and leveraged or short positions carry additional liabilities.</p></>, href: "/gate", cta: "Use the sizing calculator",
  },
  {
    id: "journal", number: "06", title: "The trade journal", question: "What should I learn from a closed trade?", Icon: NotebookPen,
    summary: "Compare the process with the outcome before allowing profit or loss to tell you the story.",
    body: <><p>Every closed trade is classified in two dimensions. Did the trade make or lose money? And did you follow the plan?</p><p><strong>Good process + good outcome</strong> is a skilled win. <strong>Good process + bad outcome</strong> is a valid loss. <strong>Poor process + good outcome</strong> is a lucky win. <strong>Poor process + bad outcome</strong> is a process loss.</p><p>The most dangerous category can be the lucky win because it rewards behaviour you do not want to repeat. Finish every closed trade with one testable lesson rather than a long diary entry.</p></>, href: "/journal", cta: "Open my journal",
  },
  {
    id: "monthly", number: "07", title: "The monthly review", question: "When should I change a rule?", Icon: BookOpen,
    summary: "After comparing results, explaining the gap and finding a repeated process problem—not immediately after one painful trade.",
    body: <><p>The monthly review has four steps. First, compare your approximate return with an appropriate benchmark. Second, explain the gap in ordinary language: allocation, selection, cash, concentration, trading, costs or tax.</p><p>Third, inspect the journal for repeated process problems. Fourth, decide whether one material rule deserves a controlled change. Write the old rule, the evidence and sample size, the exact new rule, the expected behaviour change and a review date.</p><p>Most months may need no rule change. Reducing risk for safety can happen immediately; loosening a rule to make a current trade fit should not.</p></>, href: "/monthly", cta: "Start monthly review",
  },
];

export default function GuidesPage() {
  return (
    <div>
      <section className="mb-12 rounded-[26px] bg-[#EFF6F1] p-6 sm:p-9">
        <Lightbulb size={25} className="text-[#456555]" />
        <h2 className="mt-5 max-w-3xl font-display text-[2.35rem] font-semibold leading-[1.04] tracking-[-0.04em] sm:text-[3.4rem]">Learn the routine in the order you will use it.</h2>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-mut">You do not need to become a market technician before using AXIOM. Read one lesson, use the related page, and let the repetition teach the method.</p>
      </section>

      <section className="mb-12">
        <div className="page-kicker">A good first week</div>
        <h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Start with these three things</h2>
        <div className="mt-6 grid gap-7 md:grid-cols-3">
          {[
            ["1", "Understand the order", "Read The AXIOM method and The risk check. Do not start with chart indicators."],
            ["2", "Repeat the daily check", "Use the five questions for several days. Learn what 'nothing changed' feels like."],
            ["3", "Review one real decision", "Use a closed trade or existing holding to practise process-first reflection."],
          ].map(([n, title, text]) => <div key={n} className="border-t border-[#3A453E] pt-5"><div className="text-sm font-bold text-[#a16b4c]">{n}</div><h3 className="mt-3 font-display text-2xl font-semibold tracking-[-0.025em]">{title}</h3><p className="mt-2 text-sm leading-relaxed text-mut">{text}</p></div>)}
        </div>
      </section>

      <section>
        <div className="mb-5"><div className="page-kicker">The method</div><h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Seven short lessons</h2><p className="mt-2 text-sm text-mut">Open only the lesson you need. The technical detail stays inside the lesson instead of crowding the rest of the site.</p></div>
        <div className="divide-y divide-[#27312B] border-y border-[#27312B]">
          {LESSONS.map((lesson) => (
            <details key={lesson.id} id={lesson.id} className="group scroll-mt-28">
              <summary className="grid cursor-pointer list-none gap-4 py-6 sm:grid-cols-[48px_1fr_auto] sm:items-start">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#151B17] text-[#49695a]"><lesson.Icon size={19} /></span>
                <div><div className="text-xs font-bold text-[#a16b4c]">{lesson.number}</div><h3 className="mt-1 font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.03em]">{lesson.title}</h3><p className="mt-1 text-[15px] font-semibold text-[#5f6c65]">{lesson.question}</p><p className="mt-2 max-w-2xl text-sm leading-relaxed text-mut">{lesson.summary}</p></div>
                <span className="flex items-center gap-1 text-sm font-semibold text-[#49695a]">Read <ChevronDown size={15} className="transition-transform group-open:rotate-180" /></span>
              </summary>
              <div className="mb-7 ml-0 rounded-[22px] bg-[#fffdf8]/76 p-6 sm:ml-16 sm:p-8">
                <div className="max-w-3xl space-y-4 text-[15px] leading-relaxed text-mut [&_strong]:font-semibold [&_strong]:text-ink">{lesson.body}</div>
                {lesson.href && <Link href={lesson.href} className="btn-primary mt-7">{lesson.cta} <ArrowRight size={15} /></Link>}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-12 border-t border-[#27312B] pt-10">
        <details>
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between gap-4"><div><div className="page-kicker">For the curious</div><h2 className="mt-1 font-display text-[1.9rem] font-semibold tracking-[-0.03em]">Why AXIOM is benchmark-first</h2><p className="mt-2 text-sm text-mut">The evidence that shaped the system's bias toward a benchmark-aware core and a separately measured active sleeve.</p></div><ChevronDown size={20} className="shrink-0 text-faint" /></div>
          </summary>
          <div className="mt-7 rounded-[22px] bg-[#fffdf8]/76 p-6 sm:p-8">
            <div className="flex items-start gap-4"><CircleHelp size={20} className="mt-1 shrink-0 text-[#a16b4c]" /><div className="max-w-3xl space-y-4 text-sm leading-relaxed text-mut"><p>The evidence pack bundled with the original system uses SPIVA large-cap observations from 2001–2025. In that series, actively managed large-cap funds underperformed the S&amp;P 500 in an average of 65.04% of the annual observations, and a majority underperformed in 22 of 25 calendar years.</p><p>That does not prove an individual swing method cannot add value. It does place the burden of proof on active decisions. AXIOM therefore keeps the long-term core benchmark-aware and treats swing trading as a capped, journalled experiment whose results must be measured separately.</p><p>The default risk thresholds are governance starting points, not statistically proven alpha signals. They should be reviewed against your own evidence and changed carefully.</p></div></div>
          </div>
        </details>
      </section>

      <div className="mt-12 flex items-start gap-4 border-t border-[#27312B] pt-7"><Check size={20} className="mt-1 shrink-0 text-[#49695a]" /><div><div className="font-semibold">You do not need to finish the Learn section before using AXIOM.</div><p className="mt-1 text-sm leading-relaxed text-mut">The intended learning loop is read a little, use the routine, record a real decision, then return with a better question.</p></div></div>
    </div>
  );
}
