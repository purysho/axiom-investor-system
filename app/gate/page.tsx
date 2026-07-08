"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowDownToLine, Check, CircleHelp, Gauge, ShieldCheck,
  ShieldOff, ArrowRight, ChevronDown,
} from "lucide-react";
import { fmtN, fmtUsd, Stat } from "@/components/chrome";
import { toast } from "@/components/toast";
import { evaluateGate } from "@/lib/engine/gate";
import { computeSizing } from "@/lib/engine/sizing";
import { update, useAppState } from "@/lib/store";

const numOrNull = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const PLAIN_CHECKS: Record<string, { title: string; why: string }> = {
  trend: { title: "Is the broad market still in its longer-term uptrend?", why: "AXIOM compares your benchmark with its 200-day moving average. This is a simple backdrop check, not a prediction." },
  vix: { title: "Is market volatility within your normal limit?", why: "The VIX is a broad measure of expected U.S. stock-market volatility. Higher readings can mean faster moves and more execution risk." },
  nfci: { title: "Are financial conditions within your normal limit?", why: "NFCI is a broad measure of financial conditions. Tighter conditions can make risk assets less forgiving." },
  dd: { title: "Is your own portfolio drawdown still within bounds?", why: "Your personal results matter. AXIOM reduces permission when your account has already moved too far below its high-water mark." },
  openrisk: { title: "Do you still have room in your swing-risk budget?", why: "This adds the planned stop risk of all open swing trades. It helps stop several individually small trades becoming one large portfolio risk." },
  events: { title: "Are there any unaccepted all-or-nothing events ahead?", why: "Earnings, rulings and similar events can gap through a stop. AXIOM asks whether that risk has been explicitly accepted before a new trade is planned." },
};

export default function GatePage() {
  const state = useAppState();
  const gate = evaluateGate(state.gateInputs, state.settings, state.trades);
  const { gateInputs: gi, settings } = state;
  const [fetching, setFetching] = useState(false);
  const [entry, setEntry] = useState("50");
  const [stop, setStop] = useState("47.50");
  const [target, setTarget] = useState("55");

  const sizing = computeSizing({
    portfolioValue: settings.portfolioValue,
    riskPerTradePct: settings.riskPerTradePct,
    entry: numOrNull(entry), stop: numOrNull(stop), target: numOrNull(target),
    notionalCapPct: settings.notionalCapPct,
  });

  const setGi = (patch: Partial<typeof gi>) => update((prev) => ({ ...prev, gateInputs: { ...prev.gateInputs, ...patch } }));
  const setThreshold = (key: keyof typeof settings.thresholds, v: number) => update((prev) => ({ ...prev, settings: { ...prev.settings, thresholds: { ...prev.settings.thresholds, [key]: v } } }));
  const setSetting = (key: "portfolioValue" | "riskPerTradePct" | "notionalCapPct" | "heatCapPct", v: number) => update((prev) => ({ ...prev, settings: { ...prev.settings, [key]: v } }));

  const fetchLatest = async () => {
    setFetching(true);
    try {
      const res = await fetch(`/api/market?benchmark=${encodeURIComponent(settings.benchmarkSymbol)}`);
      const data = await res.json();
      const patch: Partial<typeof gi> = { asOf: new Date().toLocaleString(), source: "FRED + Stooq (delayed)" };
      if (data.vix) patch.vix = data.vix.value;
      if (data.nfci) patch.nfci = data.nfci.value;
      if (data.benchmark) {
        patch.benchClose = data.benchmark.close ?? null;
        patch.benchSma200 = data.benchmark.sma200 ?? null;
        if (data.benchmark.aboveSma200 !== null && data.benchmark.aboveSma200 !== undefined) patch.benchAbove200dma = data.benchmark.aboveSma200;
      }
      setGi(patch);
      const missing = [!data.vix && "VIX", !data.nfci && "NFCI", !data.benchmark && "benchmark"].filter(Boolean);
      if (missing.length) toast(`Fetched with gaps — ${missing.join(", ")} missing`, "warning");
      else toast("Risk data updated — delayed figures, verify before acting.");
    } catch {
      toast("Could not update market data. Manual entry still works.", "error");
    } finally {
      setFetching(false);
    }
  };

  const stateMeta = gate.state === "RISK ALLOWED"
    ? { Icon: ShieldCheck, answer: "Yes — you may consider new swing risk.", copy: "All six checks are clear. This does not make any trade good; it only means your process allows you to review ideas and size them normally.", bg: "#e6efe8", ink: "#34D399" }
    : gate.state === "REDUCED RISK ONLY"
      ? { Icon: AlertTriangle, answer: "Only with extra caution.", copy: "One check is outside your normal limit. Smaller risk or standing aside is the default. Any exception should be written down before a trade is planned.", bg: "#241C0E", ink: "#F0B429" }
      : { Icon: ShieldOff, answer: "No — do not take new swing risk today.", copy: "Two or more checks are failing or unresolved. Manage existing positions and leave new trade ideas alone until the conditions are understood.", bg: "#241111", ink: "#F4645C" };

  return (
    <div>
      <header className="page-intro mb-8">
        <div className="page-kicker">Before looking for a trade</div>
        <h1>Can I take new swing risk today?</h1>
        <p>AXIOM uses six simple checks to answer one question. This is a permission check, not a market forecast.</p>
      </header>

      <section className="mb-10 rounded-[26px] p-6 sm:p-9" style={{ background: stateMeta.bg }}>
        <div className="max-w-3xl">
          <stateMeta.Icon size={27} style={{ color: stateMeta.ink }} />
          <h2 className="mt-5 font-display text-[2.4rem] font-semibold leading-[1.02] tracking-[-0.04em] sm:text-[3.5rem]">{stateMeta.answer}</h2>
          <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-mut">{stateMeta.copy}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary" onClick={fetchLatest} disabled={fetching}><ArrowDownToLine size={16} />{fetching ? "Updating…" : "Update today's market checks"}</button>
            <span className="text-sm text-mut">{gi.asOf ? `Last updated ${gi.asOf}` : "Market data has not been updated yet."}</span>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <div className="mb-6 max-w-2xl">
          <div className="page-kicker">What AXIOM checked</div>
          <h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Six questions, in plain English</h2>
          <p className="mt-3 text-sm leading-relaxed text-mut">Unknown facts stay unknown. AXIOM never treats missing information as a pass.</p>
        </div>

        <div className="divide-y divide-[#d9d2c6] border-y border-[#d9d2c6]">
          {gate.checks.map((c) => {
            const plain = PLAIN_CHECKS[c.id];
            const tone = c.pass ? { Icon: Check, label: "Clear", ink: "#34D399", bg: "#e8efe9" } : c.unknown ? { Icon: CircleHelp, label: "Not known", ink: "#767e79", bg: "#eeeae1" } : { Icon: AlertTriangle, label: "Outside limit", ink: "#F4645C", bg: "#f7eae5" };
            return (
              <div key={c.id} className="grid gap-4 py-6 sm:grid-cols-[48px_1fr_auto] sm:items-start">
                <span className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: tone.bg, color: tone.ink }}><tone.Icon size={18} /></span>
                <div>
                  <h3 className="text-[17px] font-semibold text-ink">{plain?.title ?? c.label}</h3>
                  <p className="mt-1 text-sm text-mut">Current reading: <strong className="font-semibold text-ink">{c.current}</strong>. Your rule is {c.threshold}.</p>
                  <details className="mt-3 group">
                    <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-[#49695a]">Why this matters <ChevronDown size={14} className="transition-transform group-open:rotate-180" /></summary>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mut">{plain?.why}</p>
                  </details>
                </div>
                <span className="badge self-start" style={{ background: tone.bg, color: tone.ink }}>{tone.label}</span>
              </div>
            );
          })}
        </div>

        <div className="mt-5 text-sm leading-relaxed text-mut">
          <strong className="text-ink">The rule is simple:</strong> no failed checks means normal risk permission; one failed check means reduced risk only; two or more failed or unresolved checks means no new swing trades.
        </div>
      </section>

      <section className="mb-12 border-t border-[#d7d0c4] pt-10">
        <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <div className="page-kicker">Two things only you can answer</div>
            <h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Add your own risk facts</h2>
            <p className="mt-3 text-sm leading-relaxed text-mut">The update button handles the broad market checks when data is available. You only need to tell AXIOM about your own drawdown and any event risk you have not accepted.</p>
          </div>
          <div className="grid gap-4">
            <label className="field-label">How far is my portfolio below its recent high? (%)
              <input className="field mt-1.5" inputMode="decimal" value={gi.drawdownPct ?? ""} onChange={(e) => setGi({ drawdownPct: numOrNull(e.target.value) })} placeholder="For example, -3.5" />
            </label>
            <label className="field-label">Is there an earnings, ruling or similar event risk I have not explicitly accepted?
              <select className="field mt-1.5" value={gi.binaryEventRisk === null ? "" : gi.binaryEventRisk ? "yes" : "no"} onChange={(e) => setGi({ binaryEventRisk: e.target.value === "" ? null : e.target.value === "yes" })}>
                <option value="">Not sure yet</option><option value="no">No</option><option value="yes">Yes</option>
              </select>
            </label>
            <details className="mt-2 rounded-[18px] bg-[#fffdf8]/70 p-5">
              <summary className="cursor-pointer list-none">
                <div className="flex items-center justify-between gap-4"><div><div className="text-sm font-semibold text-ink">Enter market facts manually</div><p className="mt-1 text-sm text-mut">Only use this when the automatic update is unavailable or you are verifying a delayed reading.</p></div><ChevronDown size={18} className="shrink-0 text-faint" /></div>
              </summary>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="field-label">Broad market trend
                  <select className="field mt-1.5" value={gi.benchAbove200dma === null ? "" : gi.benchAbove200dma ? "yes" : "no"} onChange={(e) => setGi({ benchAbove200dma: e.target.value === "" ? null : e.target.value === "yes" })}>
                    <option value="">Not known</option><option value="yes">Above its 200-day average</option><option value="no">Below its 200-day average</option>
                  </select>
                </label>
                <label className="field-label">VIX<input className="field mt-1.5" inputMode="decimal" value={gi.vix ?? ""} onChange={(e) => setGi({ vix: numOrNull(e.target.value) })} placeholder="For example, 18.4" /></label>
                <label className="field-label sm:col-span-2">Financial conditions (NFCI)<input className="field mt-1.5" inputMode="decimal" value={gi.nfci ?? ""} onChange={(e) => setGi({ nfci: numOrNull(e.target.value) })} placeholder="For example, -0.45" /></label>
                {gi.benchClose !== null && gi.benchClose !== undefined && <p className="sm:col-span-2 text-xs text-faint">{settings.benchmarkSymbol}: close {fmtN(gi.benchClose)} vs 200-day average {fmtN(gi.benchSma200 ?? null)}</p>}
              </div>
            </details>
          </div>
        </div>
      </section>

      <section className="mb-12 rounded-[22px] bg-[#fffdf8]/75 p-6 sm:p-8">
        <details>
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="page-kicker">Advanced</div>
                <h2 className="mt-1 font-display text-[1.8rem] font-semibold tracking-[-0.03em]">See or change my risk limits</h2>
                <p className="mt-2 text-sm text-mut">These are governance rules. Most beginners should set them once, then review them only during a monthly review.</p>
              </div>
              <ChevronDown size={20} className="shrink-0 text-faint" />
            </div>
          </summary>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="field-label">VIX ceiling<input className="field mt-1.5" inputMode="decimal" value={settings.thresholds.vixMax} onChange={(e) => setThreshold("vixMax", Number(e.target.value) || 0)} /></label>
            <label className="field-label">NFCI ceiling<input className="field mt-1.5" inputMode="decimal" value={settings.thresholds.nfciMax} onChange={(e) => setThreshold("nfciMax", Number(e.target.value) || 0)} /></label>
            <label className="field-label">Maximum drawdown (%)<input className="field mt-1.5" inputMode="decimal" value={settings.thresholds.maxDrawdownPct} onChange={(e) => setThreshold("maxDrawdownPct", Number(e.target.value) || 0)} /></label>
            <label className="field-label">Open swing-risk budget (%)<input className="field mt-1.5" inputMode="decimal" value={settings.thresholds.openRiskBudgetPct} onChange={(e) => setThreshold("openRiskBudgetPct", Number(e.target.value) || 0)} /></label>
            <label className="field-label">Portfolio value ($)<input className="field mt-1.5" inputMode="decimal" value={settings.portfolioValue} onChange={(e) => setSetting("portfolioValue", Number(e.target.value) || 0)} /></label>
            <label className="field-label">Risk per trade (%)<input className="field mt-1.5" inputMode="decimal" value={settings.riskPerTradePct} onChange={(e) => setSetting("riskPerTradePct", Number(e.target.value) || 0)} /></label>
            <label className="field-label">Single-position cap (%)<input className="field mt-1.5" inputMode="decimal" value={settings.notionalCapPct} onChange={(e) => setSetting("notionalCapPct", Number(e.target.value) || 0)} /></label>
            <label className="field-label">Total swing heat cap (%)<input className="field mt-1.5" inputMode="decimal" value={settings.heatCapPct} onChange={(e) => setSetting("heatCapPct", Number(e.target.value) || 0)} /></label>
          </div>
          <div className="paper-note mt-6"><p className="text-sm leading-relaxed text-mut">These defaults are not proven forecasting signals. Do not loosen a limit during the trading day to make a candidate fit. Rule changes belong in the monthly review.</p></div>
        </details>
      </section>

      <section className="border-t border-[#d7d0c4] pt-10">
        <details>
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between gap-5">
              <div className="max-w-2xl">
                <div className="page-kicker">When a trade is allowed</div>
                <h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Size a trade from the loss I can accept</h2>
                <p className="mt-3 text-sm leading-relaxed text-mut">Open the calculator when you have a real entry and stop. AXIOM works backwards from your planned risk budget instead of asking how confident you feel.</p>
              </div>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ebe7dc] text-[#49695a]"><Gauge size={18} /></span>
            </div>
          </summary>

          <div className="mt-7 rounded-[22px] bg-[#fffdf8]/75 p-6 sm:p-8">
            <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr]">
              <div className="grid gap-4">
                <label className="field-label">Planned entry ($)<input className="field mt-1.5" inputMode="decimal" value={entry} onChange={(e) => setEntry(e.target.value)} /></label>
                <label className="field-label">Initial stop ($)<input className="field mt-1.5" inputMode="decimal" value={stop} onChange={(e) => setStop(e.target.value)} /></label>
                <label className="field-label">Planned target ($)<input className="field mt-1.5" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
              </div>
              <div>
                <div className="grid grid-cols-2 gap-y-2 sm:grid-cols-4">
                  <Stat label="Planned loss budget" value={fmtUsd(sizing.riskDollars)} tone="gate" />
                  <Stat label={sizing.capApplied ? "Shares after cap" : "Maximum shares"} value={sizing.cappedShares !== null ? String(sizing.cappedShares) : "—"} />
                  <Stat label="Position value" value={fmtUsd(sizing.notional)} />
                  <Stat label="Reward versus risk" value={sizing.rewardRisk !== null ? `${fmtN(sizing.rewardRisk, 2)} to 1` : "—"} />
                </div>
                {sizing.capApplied && <p className="mt-4 text-sm text-[#F0B429]">Your {settings.notionalCapPct}% single-position cap reduced the size below the pure risk-based {sizing.maxSharesByRisk} shares.</p>}
                <div className="mt-6 flex items-start gap-3 rounded-[18px] bg-[#f8ece7] p-5">
                  <Gauge size={19} className="mt-0.5 shrink-0 text-[#b56b4e]" />
                  <div><div className="font-semibold">A stop does not guarantee your maximum loss.</div><p className="mt-1 text-sm leading-relaxed text-mut">A gap through the stop to {fmtUsd(sizing.gapExamplePrice)} would mean roughly {fmtUsd(sizing.gapExampleLoss ? -sizing.gapExampleLoss : null)} gross instead of about {fmtUsd(sizing.riskDollars)}. Stops can slip.</p></div>
                </div>
                <Link href="/watchlist" className="quiet-link mt-6">Go to trade ideas <ArrowRight size={14} /></Link>
              </div>
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
