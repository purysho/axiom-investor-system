"use client";

import Link from "next/link";
import { Panel } from "@/components/chrome";
import { DAILY_BLOCKS } from "@/lib/engine/types";

const SECTIONS = [
  { id: "principles", label: "Operating principles" },
  { id: "gate", label: "The risk gate" },
  { id: "daily", label: "Daily 15-minute check" },
  { id: "weekly", label: "Weekly portfolio review" },
  { id: "sizing", label: "Sizing & risk math" },
  { id: "debrief", label: "Closed-trade debrief" },
  { id: "monthly", label: "Monthly review" },
  { id: "evidence", label: "Evidence base" },
];

export default function GuidesPage() {
  return (
    <div className="grid gap-3">
      <Panel eyebrow="The methodology, in the tool" title="System guides">
        <p className="text-xs leading-relaxed text-mut">
          Everything the app enforces is written down here, so the site stands alone. Each loop has one primary
          question; if a page ever seems to disagree with a guide, the guide wins and the discrepancy is a bug.
        </p>
        <nav aria-label="Guide sections" className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="font-mono text-[11px] text-mut underline decoration-line hover:text-ink hover:decoration-[var(--gate)]">
              {s.label}
            </a>
          ))}
        </nav>
      </Panel>

      <Panel eyebrow="Why this exists" title="Operating principles">
        <div id="principles" className="grid gap-2 text-xs leading-relaxed text-mut">
          <p>
            <span className="font-mono text-ink">Risk permission precedes candidate discovery.</span> You never ask
            &ldquo;what looks good?&rdquo; before asking &ldquo;am I allowed to take risk today?&rdquo;. The gate answers the second
            question; only then does the first become legal.
          </p>
          <p>
            <span className="font-mono text-ink">The core compounds; the satellite is measured.</span> Long-term
            holdings track a benchmark and are reviewed weekly for role and thesis, not price wiggles. Active
            risk lives in a separate, capped sleeve whose every trade becomes a data point.
          </p>
          <p>
            <span className="font-mono text-ink">Process over outcome.</span> A profitable rule violation is still a
            process failure; a losing trade that followed the plan is a process success. Rules change on
            repeated patterns at the monthly review — never after one painful trade, never intraday. Safety
            reductions are the one exception: cutting risk can always happen immediately.
          </p>
          <p>
            <span className="font-mono text-ink">Honesty about data and limits.</span> Figures are delayed and
            free-tier; unknown inputs count as failed checks, not as passes. Planned stop risk is not a
            guaranteed maximum loss. Nothing here is individualized investment advice.
          </p>
        </div>
      </Panel>

      <Panel eyebrow="Six checks, three states" title="The risk gate">
        <div id="gate" className="grid gap-2 text-xs leading-relaxed text-mut">
          <p>
            The gate asks whether conditions and your own account justify new active risk. Six checks, each pass
            or fail: the benchmark closes above its 200-day moving average; VIX is at or below 25; the Chicago
            Fed&apos;s NFCI is at or below +0.50 (positive means tighter financial conditions); your account drawdown
            from its high-water mark is no worse than −10%; open planned swing risk is at or below 2% of the
            portfolio; and there is no unaccepted binary-event risk (earnings, decisions, rulings) hanging over a
            planned trade.
          </p>
          <p>
            <span style={{ color: "#2FBF8F" }}>Zero fails → RISK ALLOWED.</span>{" "}
            <span style={{ color: "#E7A83E" }}>One fail → REDUCED RISK ONLY</span> — smaller size, and the exception
            documented. <span style={{ color: "#E5484D" }}>Two or more → NO NEW SWINGS</span> — manage existing
            positions only; the candidates block on the daily page physically locks. Unknown or stale inputs are
            counted as fails until real data arrives. The thresholds are governance defaults reviewed monthly —
            useful lines in the sand, not proven forecasting signals.
          </p>
        </div>
      </Panel>

      <Panel eyebrow="Exception detection, not research" title="Daily 15-minute check">
        <div id="daily" className="grid gap-1.5 text-xs leading-relaxed text-mut">
          <p>
            Fifteen minutes, five timed blocks, one required output. This is a scan for exceptions, not a
            miniature research day — if nothing demands action, the correct entry is &ldquo;no action.&rdquo;
          </p>
          <ol className="grid gap-1.5">
            {DAILY_BLOCKS.map((b) => (
              <li key={b.id}>
                <span className="font-mono text-ink">{b.time} · {b.title}.</span> {b.objective}{" "}
                <span className="text-faint">Rule: {b.rule}</span>
              </li>
            ))}
          </ol>
          <p>
            The day ends by completing the sentence <span className="font-mono text-ink">&ldquo;Today&apos;s permitted action
            is ___ because ___&rdquo;</span> — the single line the dashboard shows all day.
          </p>
        </div>
      </Panel>

      <Panel eyebrow="Role and thesis, not price wiggles" title="Weekly portfolio review">
        <div id="weekly" className="grid gap-2 text-xs leading-relaxed text-mut">
          <p>
            Once a week, 30–60 minutes: reconcile holdings, values, weights, and forward income; check sleeve
            drift (Core / Income / Satellite / Cash) and rebalance by rule; for each holding ask whether its role
            and thesis are intact, its benchmark still appropriate, its concentration acceptable. Dividend
            holdings get their annual dividend, coverage grade, balance-sheet grade, and dividend-trend grade
            refreshed; ETFs get mandate, index fit, expense-ratio changes, distribution pattern, and overlap
            checked.
          </p>
          <p>
            Compare the portfolio against its benchmark and write down the reason for any gap — allocation,
            selection, cash drag, costs, tax. Then commit to <span className="font-mono text-ink">at most three
            actions</span> for the coming week. &ldquo;No action&rdquo; is a valid, often correct, answer. Yield alone is not
            a quality score; forward income is an output, not a target to chase.
          </p>
        </div>
      </Panel>

      <Panel eyebrow="Size from risk, never from conviction" title="Sizing & risk math">
        <div id="sizing" className="grid gap-2 text-xs leading-relaxed text-mut">
          <p>
            One R is the dollars you plan to lose if the initial stop is hit: portfolio value × risk-per-trade
            (default 0.5%). Shares = R ÷ (entry − stop), then capped so no single name exceeds the notional cap
            (default 20% of equity). Worked example: $100,000 at 0.5% is a $500 budget; entry $50, stop $47.50 is
            $2.50 of risk per share → 200 shares, $10,000 position.
          </p>
          <p>
            Two caps sit above every trade: per-name notional, and total portfolio heat — the sum of all open
            planned risk — at roughly 6%. And one liability is written on the calculator itself: a stop order
            does not guarantee the stop price. A gap through $47.50 to $44 turns the planned $500 loss into
            roughly $1,200. Cash-funded long trades are the default assumption; margin, shorts, and complex
            products need their own playbooks and smaller budgets.
          </p>
        </div>
      </Panel>

      <Panel eyebrow="Within 24 hours of exit" title="Closed-trade debrief">
        <div id="debrief" className="grid gap-2 text-xs leading-relaxed text-mut">
          <p>
            Every closed trade becomes a comparable data point or it was wasted tuition. Record exit price, fees,
            exit date, MFE/MAE if tracked, the exit reason (Target, Stop, Trail, Time Stop, Thesis Break,
            Manual, Event Risk), whether the plan was followed, one primary mistake tag, and{" "}
            <span className="font-mono text-ink">one falsifiable lesson</span> — a sentence a future trade could
            prove wrong.
          </p>
          <p>
            Tags like moved-stop, fomo-entry, cut-winner-early, let-loser-run, revenge-trade, oversized, and
            chasing are counted as behavioral leaks across the ledger. A repeated leak is what earns a rule
            change at the monthly review — a single occurrence earns only a note.
          </p>
        </div>
      </Panel>

      <Panel eyebrow="Compare · attribute · diagnose · change one rule" title="Monthly review">
        <div id="monthly" className="grid gap-2 text-xs leading-relaxed text-mut">
          <p>
            Sixty to ninety minutes at month-end. First compare: compute the flow-adjusted return
            ((end − start − net contributions) ÷ (start + net contributions), a deliberate simple approximation)
            and the gap to the benchmark. Second attribute: explain that gap in words — allocation, selection,
            cash drag, concentration, trading, costs, tax. Third diagnose process: swing expectancy, win rate,
            profit factor, adherence, largest loss in R, mistake-tag frequency.
          </p>
          <p>
            Finally, change <span className="font-mono text-ink">at most one material rule</span>, written as: old
            rule → evidence and sample size → exact new rule → expected behavior change → review date. Reducing
            risk is always a valid performance decision and never needs to wait for month-end.
          </p>
        </div>
      </Panel>

      <Panel eyebrow="Why benchmark-first" title="Evidence base">
        <div id="evidence" className="grid gap-2 text-xs leading-relaxed text-mut">
          <p>
            In the SPIVA large-cap snapshot bundled with this system (2001–2025), actively managed funds
            underperformed the S&amp;P 500 in an average of 65.04% of observations, and a majority underperformed
            in 22 of 25 calendar years. That asymmetry is the reason the core sleeve tracks a benchmark and
            active risk is a separate, gated, measured experiment — the burden of proof sits on the active
            sleeve, and the journal is where it testifies.
          </p>
          <p className="text-faint">
            Sources and thresholds live with your data and are reviewed monthly on the{" "}
            <Link href="/gate" className="underline decoration-line hover:decoration-[var(--gate)]">gate page</Link>.
          </p>
        </div>
      </Panel>
    </div>
  );
}
