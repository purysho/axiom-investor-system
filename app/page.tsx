"use client";

import Link from "next/link";
import { EquityCurve, GateHistory, MonthlyReturnsChart } from "@/components/charts";
import { fmtPct, fmtR, fmtUsd, Panel, Stat } from "@/components/chrome";
import { demoState } from "@/lib/backup";
import { suggestPermittedAction } from "@/lib/engine/action";
import { evaluateGate, openPlannedRiskUsd } from "@/lib/engine/gate";
import { journalStats, portfolioStats } from "@/lib/engine/stats";
import { isoWeekKey, replaceState, todayKey, useAppState } from "@/lib/store";

export default function Dashboard() {
  const state = useAppState();
  const gate = evaluateGate(state.gateInputs, state.settings, state.trades);
  const js = journalStats(state.trades);
  const ps = portfolioStats(state.holdings);

  const empty =
    js.closedCount === 0 &&
    js.openCount === 0 &&
    state.holdings.length === 0 &&
    state.watchRules.length === 0 &&
    state.monthly.length === 0 &&
    Object.keys(state.dailyChecks).length === 0;

  const today = todayKey();
  const todaysCheck = state.dailyChecks[today];
  const suggestion = suggestPermittedAction(gate, state.trades);
  const action = todaysCheck?.action || suggestion.action;
  const because = todaysCheck?.because || suggestion.because;

  const weekTag = isoWeekKey();
  const weeklyDone = state.weeklyReviews.includes(weekTag);
  const monthTag = today.slice(0, 7);
  const monthlyDone = state.monthly.some((m) => m.monthStart.startsWith(monthTag) && m.endingValue !== null);
  const openRisk = openPlannedRiskUsd(state.trades);
  const openRiskPct = state.settings.portfolioValue > 0 ? (openRisk / state.settings.portfolioValue) * 100 : 0;

  // Next suggested step
  const nextStep = !state.gateInputs.asOf ? { label: "Fetch gate data →", href: "/gate" }
    : !todaysCheck ? { label: "Run today's daily check →", href: "/daily" }
    : state.trades.some((t) => t.status === "Open") ? { label: "Review open positions →", href: "/journal" }
    : !weeklyDone ? { label: "Run weekly portfolio review →", href: "/portfolio" }
    : { label: "You're up to date ✓", href: "/" };

  return (
    <div className="grid gap-3">
      {empty && (
        <section className="panel border-l-4 p-4" style={{ borderLeftColor: "var(--gate)" }}>
          <div className="eyebrow">First run · nothing saved yet</div>
          <h2 className="mt-1 font-mono text-base text-ink">Start with risk, not with a ticker.</h2>
          <ol className="mt-2 grid gap-1.5 text-xs text-mut">
            <li><span className="font-mono text-faint">1 · </span><Link className="underline decoration-line hover:decoration-[var(--gate)]" href="/settings">Set your profile</Link> — portfolio value, benchmark, risk per trade.</li>
            <li><span className="font-mono text-faint">2 · </span><Link className="underline decoration-line hover:decoration-[var(--gate)]" href="/gate">Open the risk gate</Link> and fetch today's inputs.</li>
            <li><span className="font-mono text-faint">3 · </span><Link className="underline decoration-line hover:decoration-[var(--gate)]" href="/daily">Run the 15-minute daily check.</Link></li>
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-gate" onClick={() => replaceState(demoState())}>Load demo data</button>
            <span className="font-mono text-[11px] text-faint">or go to <Link href="/settings" className="underline">Settings</Link> to enter yours</span>
          </div>
        </section>
      )}

      {/* Permitted action */}
      <section className="panel border-l-4 p-4" style={{ borderLeftColor: "var(--gate)" }}>
        <div className="flex items-baseline justify-between gap-2">
          <div className="eyebrow">Required daily output</div>
          <div className="eyebrow text-faint">{today}</div>
        </div>
        <p className="mt-1.5 font-mono text-base leading-relaxed text-ink">
          Today's permitted action is <span style={{ color: "var(--gate)" }}>{action}</span> because{" "}
          <span className="text-mut">{because}</span>.
        </p>
        {!todaysCheck && !empty && (
          <p className="mt-2 text-xs text-faint">
            Suggested from current gate —{" "}
            <Link className="underline decoration-line hover:decoration-[var(--gate)]" href="/daily">run the 15-min check</Link> to confirm.
          </p>
        )}
        {todaysCheck && <p className="mt-2 font-mono text-[11px] text-faint">saved · gate was {todaysCheck.gateState}</p>}
        {/* Next step CTA */}
        {nextStep.href !== "/" && (
          <Link href={nextStep.href} className="mt-3 inline-flex items-center gap-1 font-mono text-xs" style={{ color: "var(--gate)" }}>
            {nextStep.label}
          </Link>
        )}
      </section>

      {/* Key stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Open planned risk" value={`${fmtPct(openRiskPct, 2)} · ${fmtUsd(openRisk)}`} tone="gate" />
        <Stat label="Closed swing net P&L" value={fmtUsd(js.netPnlUsd)} tone={js.netPnlUsd >= 0 ? "good" : "bad"} />
        <Stat label="Win rate / Avg R" value={`${fmtPct(js.winRatePct, 0)} / ${fmtR(js.avgR)}`} />
        <Stat label="Rule adherence" value={fmtPct(js.adherencePct, 0)} />
      </div>

      {/* Charts row */}
      {(js.closedCount >= 2 || Object.keys(state.dailyChecks).length >= 2 || state.monthly.length >= 1) && (
        <div className="grid gap-3 md:grid-cols-3">
          {js.closedCount >= 2 && (
            <Panel eyebrow="Swing sleeve" title="Equity curve (R)">
              <EquityCurve trades={state.trades} />
            </Panel>
          )}
          {Object.keys(state.dailyChecks).length >= 2 && (
            <Panel eyebrow="Last 30 days" title="Gate history">
              <GateHistory checks={state.dailyChecks} />
            </Panel>
          )}
          {state.monthly.length >= 1 && (
            <Panel eyebrow="vs benchmark" title="Monthly returns">
              <MonthlyReturnsChart monthly={state.monthly} />
            </Panel>
          )}
        </div>
      )}

      {/* Portfolio snapshot + evidence */}
      <div className="grid gap-3 md:grid-cols-2">
        <Panel eyebrow="Long-term sleeve" title="Portfolio snapshot">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Market value" value={fmtUsd(ps.totalMarketValue)} />
            <Stat label="Forward income" value={fmtUsd(ps.forwardIncome)} />
            <Stat label="Portfolio yield" value={fmtPct(ps.portfolioYieldPct)} />
            <Stat label="Top weight" value={ps.topWeightTicker ? `${ps.topWeightTicker} ${fmtPct(ps.topWeightPct)}` : "—"} />
          </div>
          {ps.unpricedTickers.length > 0 && <p className="mt-2 text-xs text-faint">Awaiting prices: {ps.unpricedTickers.join(", ")}</p>}
          <Link href="/portfolio" className="mt-2 block font-mono text-[11px]" style={{ color: "var(--gate)" }}>Open portfolio →</Link>
        </Panel>
        <Panel eyebrow="Operating rule" title="Why benchmark-first">
          <p className="text-xs leading-relaxed text-mut">
            In the SPIVA 2001–2025 large-cap snapshot, active funds underperformed the S&P 500 in an average of
            65.04% of observations, and a majority underperformed in 22 of 25 years. The core compounds against a
            benchmark; active risk is a separate, gated, measured sleeve. A profitable rule violation is still a
            process failure.
          </p>
        </Panel>
      </div>
    </div>
  );
}
