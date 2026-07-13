"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight, Check, CircleAlert, Download, Plus, RefreshCw, ChevronDown,
  PieChart, CircleCheckBig, WalletCards, Banknote, Scale,
} from "lucide-react";
import { fmtPct, fmtUsd } from "@/components/chrome";
import { downloadText, exportPortfolioCsv } from "@/lib/csv";
import { portfolioStats } from "@/lib/engine/stats";
import {
  ACTIONS, GRADES, THESIS_STATUSES,
  type Grade, type Holding, type HoldingAction, type Sleeve, type ThesisStatus,
} from "@/lib/engine/types";
import { isoWeekKey, uid, update, useAppState } from "@/lib/store";

const numOrNull = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const REVIEW_STEPS = [
  { title: "Check the list is accurate", text: "Make sure holdings, shares and prices are broadly current." },
  { title: "Ask why each holding is still here", text: "The role and thesis matter more than this week's price move." },
  { title: "Look for concentration or income-quality problems", text: "Notice large weight drift, weak payout quality or unnecessary overlap." },
  { title: "Choose no more than three actions", text: "Hold is a decision. Do not create activity just to finish the review." },
];

const emptyAdd = {
  ticker: "", type: "ETF" as Holding["type"], sleeve: "Core" as Sleeve,
  shares: "", costBasis: "", price: "", targetWeightPct: "",
  expenseRatioPct: "", yieldPct: "", annualDistPerShare: "", benchmark: "",
};

function roleCopy(sleeve: Sleeve) {
  if (sleeve === "Core") return "Long-term foundation";
  if (sleeve === "Income") return "Income-producing holding";
  if (sleeve === "Satellite") return "Smaller supporting position";
  return "Cash or cash-like reserve";
}

export default function PortfolioPage() {
  const state = useAppState();
  const ps = portfolioStats(state.holdings);
  const weekTag = isoWeekKey();
  const reviewed = state.weeklyReviews.includes(weekTag);
  const [checked, setChecked] = useState<boolean[]>(REVIEW_STEPS.map(() => false));
  const [add, setAdd] = useState(emptyAdd);
  const [priceNotice, setPriceNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const plannedActions = state.holdings.filter((h) => h.action && h.action !== "Hold" && h.action !== "Watch").length;
  const attention = useMemo(() => state.holdings.map((h) => {
    const row = ps.rows.find((r) => r.id === h.id);
    const reasons: string[] = [];
    if (row?.driftPct !== null && row?.driftPct !== undefined && Math.abs(row.driftPct) > 5) reasons.push(`${Math.abs(row.driftPct).toFixed(1)}% away from target weight`);
    if (h.thesisStatus === "Watch") reasons.push("thesis is on watch");
    if (h.thesisStatus === "Broken") reasons.push("thesis is marked broken");
    if (h.payoutGrade === "C" || h.payoutGrade === "D") reasons.push(`payout quality is graded ${h.payoutGrade}`);
    return reasons.length ? { h, row, reasons } : null;
  }).filter(Boolean) as Array<{ h: Holding; row: (typeof ps.rows)[number] | undefined; reasons: string[] }>, [state.holdings, ps.rows]);

  const refreshPrices = async () => {
    const tickers = [...new Set(state.holdings.map((h) => h.ticker).filter(Boolean))];
    if (tickers.length === 0) return;
    setRefreshing(true);
    setPriceNotice("");
    try {
      const res = await fetch(`/api/quotes?mode=close&symbols=${encodeURIComponent(tickers.join(","))}`);
      if (!res.ok) throw new Error();
      const j = (await res.json()) as { quotes: Array<{ ticker: string; close: number | null; date: string | null }> };
      const byTicker = new Map(j.quotes.map((q) => [q.ticker.toUpperCase(), q]));
      let updated = 0;
      update((prev) => ({
        ...prev,
        holdings: prev.holdings.map((h) => {
          const q = byTicker.get(h.ticker.toUpperCase());
          if (!q || q.close === null) return h;
          updated++;
          return { ...h, price: q.close, priceAsOf: q.date ? `${q.date} · Stooq delayed EOD` : "Stooq delayed EOD" };
        }),
      }));
      const failed = j.quotes.filter((q) => q.close === null).map((q) => q.ticker);
      const asOf = j.quotes.find((q) => q.date)?.date;
      setPriceNotice(`Updated ${updated}/${tickers.length}${asOf ? ` · closes as of ${asOf}` : ""}${failed.length ? ` · enter manually: ${failed.join(", ")}` : ""}`);
    } catch {
      setPriceNotice("Could not fetch prices. Manual entry still works.");
    } finally {
      setRefreshing(false);
    }
  };

  const patchHolding = (id: string, patch: Partial<Holding>) => update((prev) => ({ ...prev, holdings: prev.holdings.map((h) => h.id === id ? { ...h, ...patch } : h) }));
  const removeHolding = (id: string) => update((prev) => ({ ...prev, holdings: prev.holdings.filter((h) => h.id !== id) }));
  const markReviewed = () => update((prev) => ({ ...prev, weeklyReviews: prev.weeklyReviews.includes(weekTag) ? prev.weeklyReviews : [...prev.weeklyReviews, weekTag] }));

  const addHolding = () => {
    if (!add.ticker.trim()) return;
    const h: Holding = {
      id: uid("H"), ticker: add.ticker.trim().toUpperCase(), type: add.type, sleeve: add.sleeve,
      shares: numOrNull(add.shares), costBasis: numOrNull(add.costBasis), price: numOrNull(add.price),
      targetWeightPct: numOrNull(add.targetWeightPct), expenseRatioPct: numOrNull(add.expenseRatioPct),
      yieldPct: numOrNull(add.yieldPct), payoutRatioPct: null, annualDistPerShare: numOrNull(add.annualDistPerShare),
      benchmark: add.benchmark, thesisStatus: "Intact", payoutGrade: "", coverageNote: "", action: "Hold", notes: "",
    };
    update((prev) => ({ ...prev, holdings: [...prev.holdings, h] }));
    setAdd(emptyAdd);
  };

  return (
    <div>
      {state.holdings.length === 0 ? (
        <section className="rounded-[26px] bg-[#141B17] p-6 sm:p-9">
          <WalletCards size={25} className="text-[#456555]" />
          <h2 className="mt-5 max-w-2xl font-display text-[1.55rem] font-semibold leading-[1.04] tracking-[-0.04em] sm:text-[2rem]">Add the investments you actually plan to hold.</h2>
          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-mut">Start with your long-term portfolio. You do not need every data point on day one. Ticker, shares and a rough role are enough to begin.</p>
          <button type="button" className="btn-primary mt-7" onClick={() => document.getElementById("add-holding")?.scrollIntoView({ behavior: "smooth" })}>Add my first holding <ArrowRight size={16} /></button>
        </section>
      ) : (
        <>
          <section className="mb-10 grid gap-8 border-b border-[#27312B] pb-10 lg:grid-cols-[1.35fr_.65fr] lg:items-end">
            <div>
              <div className="page-kicker">Your portfolio in plain English</div>
              <h2 className="mt-2 max-w-3xl font-display text-[1.6rem] font-semibold leading-[1.04] tracking-[-0.04em] sm:text-[2.05rem]">
                You own {state.holdings.length} holding{state.holdings.length === 1 ? "" : "s"} worth about {fmtUsd(ps.totalMarketValue)}.
              </h2>
              <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-mut">
                {ps.topWeightTicker ? `${ps.topWeightTicker} is your largest position at ${fmtPct(ps.topWeightPct)}. ` : ""}
                {ps.forwardIncome > 0 ? `Your current inputs imply about ${fmtUsd(ps.forwardIncome)} of forward annual income. ` : ""}
                {attention.length ? `${attention.length} holding${attention.length === 1 ? "" : "s"} deserve a closer look this week.` : "Nothing currently crosses the simple attention rules."}
              </p>
              {ps.pricedCount > 0 && (
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-faint">
                  {ps.totalUnrealizedUsd !== null ? `Unrealized: ${ps.totalUnrealizedUsd >= 0 ? "+" : ""}${fmtUsd(ps.totalUnrealizedUsd)}. ` : ""}
                  {ps.effectiveHoldings !== null ? `Diversification: behaves like ${ps.effectiveHoldings.toFixed(1)} equal positions. ` : ""}
                  {ps.sleeves.length > 1 ? `Mix: ${ps.sleeves.map((s) => `${s.sleeve} ${fmtPct(s.weightPct, 0)}`).join(" · ")}.` : ""}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <button type="button" className="btn" onClick={() => void refreshPrices()} disabled={refreshing}><RefreshCw size={15} />{refreshing ? "Updating…" : "Update prices"}</button>
              <button type="button" className="btn" onClick={() => downloadText("portfolio.csv", exportPortfolioCsv(state.holdings))}><Download size={15} />Export</button>
            </div>
          </section>
          {priceNotice && <p className="-mt-6 mb-8 text-sm text-mut" role="status">{priceNotice}</p>}
        </>
      )}

      {state.holdings.length > 0 && attention.length > 0 && (
        <section className="mb-12">
          <div className="page-kicker">Look here first</div>
          <h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">What may need a decision</h2>
          <div className="mt-5 divide-y divide-[#27312B] border-y border-[#27312B]">
            {attention.map(({ h, row, reasons }) => (
              <div key={h.id} className="grid gap-3 py-5 sm:grid-cols-[44px_1fr_auto] sm:items-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#241111] text-[#F4645C]"><CircleAlert size={18} /></span>
                <div><div className="text-[17px] font-semibold">{h.ticker}</div><p className="mt-1 text-sm text-mut">{reasons.join(" · ")}</p></div>
                <div className="text-sm text-mut">{row?.weightPct !== null && row?.weightPct !== undefined ? `${fmtPct(row.weightPct)} of portfolio` : "Weight unavailable"}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {state.holdings.length > 0 && (
        <section className="mb-12 rounded-[24px] bg-[#241C0E]/76 p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-2xl">
              <div className="page-kicker">Once a week</div>
              <h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Do the portfolio review</h2>
              <p className="mt-3 text-sm leading-relaxed text-mut">This is not a hunt for something to buy or sell. You are checking whether the reasons for owning your investments still make sense.</p>
            </div>
            {reviewed ? <span className="badge bg-[#10241C] text-[#34D399]"><CircleCheckBig size={15} />Reviewed this week</span> : <span className="badge bg-[#241C0E] text-[#F0B429]">Review due</span>}
          </div>
          <div className="mt-7 divide-y divide-[#27312B] border-y border-[#27312B]">
            {REVIEW_STEPS.map((item, i) => (
              <label key={item.title} className="flex cursor-pointer items-start gap-4 py-5">
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${checked[i] ? "bg-[#B4F03C] text-[#0B0F0D]" : "border border-[#3A453E] bg-[#241C0E] text-transparent"}`}><Check size={14} /></span>
                <input type="checkbox" className="sr-only" checked={checked[i]} onChange={() => setChecked((prev) => prev.map((v, j) => j === i ? !v : v))} />
                <span><span className="block font-semibold">{item.title}</span><span className="mt-1 block text-sm leading-relaxed text-mut">{item.text}</span></span>
              </label>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button type="button" className="btn-primary" onClick={markReviewed} disabled={reviewed || checked.some((v) => !v)}>{reviewed ? "Review complete" : "Finish this week's review"} <Check size={15} /></button>
            <span className="text-sm text-mut">{plannedActions} action{plannedActions === 1 ? "" : "s"} currently marked Add, Trim, Exit or Rebalance. Keep it to three or fewer.</span>
          </div>
        </section>
      )}

      {state.holdings.length > 0 && (
        <section className="mb-12">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><div className="page-kicker">What you own</div><h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Holdings</h2></div>
            <div className="text-sm text-mut">Click a holding to review or edit it.</div>
          </div>
          <div className="divide-y divide-[#27312B] border-y border-[#27312B]">
            {state.holdings.map((h) => {
              const row = ps.rows.find((r) => r.id === h.id);
              const drift = row?.driftPct ?? null;
              return (
                <details key={h.id} className="group">
                  <summary className="grid cursor-pointer list-none gap-3 py-5 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                    <div>
                      <div className="flex items-center gap-3"><span className="text-[18px] font-bold">{h.ticker}</span><span className="badge bg-[#1A211D] text-[#69736d]">{h.sleeve}</span></div>
                      <p className="mt-1 text-sm text-mut">{roleCopy(h.sleeve)} · Thesis {h.thesisStatus ? h.thesisStatus.toLowerCase() : "not reviewed"}</p>
                    </div>
                    <div className="text-sm sm:text-right"><div className="font-semibold">{fmtUsd(row?.marketValue ?? null)}</div><div className="text-xs text-faint">{fmtPct(row?.weightPct ?? null)} of portfolio</div></div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#49695a]">Review <ChevronDown size={15} className="transition-transform group-open:rotate-180" /></div>
                  </summary>
                  <div className="mb-6 rounded-[20px] bg-[#241C0E]/76 p-5 sm:p-7">
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="field-label">Role in portfolio<select className="field mt-1.5" value={h.sleeve} onChange={(e) => patchHolding(h.id, { sleeve: e.target.value as Sleeve })}>{(["Core", "Income", "Satellite", "Cash"] as Sleeve[]).map((s) => <option key={s}>{s}</option>)}</select></label>
                      <label className="field-label">Thesis status<select className="field mt-1.5" value={h.thesisStatus} onChange={(e) => patchHolding(h.id, { thesisStatus: e.target.value as ThesisStatus })}><option value="">Not reviewed</option>{THESIS_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
                      <label className="field-label">Planned action<select className="field mt-1.5" value={h.action} onChange={(e) => patchHolding(h.id, { action: e.target.value as HoldingAction })}><option value="">No action set</option>{ACTIONS.map((a) => <option key={a}>{a}</option>)}</select></label>
                      <label className="field-label">Payout quality<select className="field mt-1.5" value={h.payoutGrade} onChange={(e) => patchHolding(h.id, { payoutGrade: e.target.value as Grade })}><option value="">Not graded</option>{GRADES.map((g) => <option key={g}>{g}</option>)}</select></label>
                      <label className="field-label">Shares<input className="field mt-1.5" inputMode="decimal" value={h.shares ?? ""} onChange={(e) => patchHolding(h.id, { shares: numOrNull(e.target.value) })} /></label>
                      <label className="field-label">Price ($)<input className="field mt-1.5" inputMode="decimal" title={h.priceAsOf ?? undefined} value={h.price ?? ""} onChange={(e) => patchHolding(h.id, { price: numOrNull(e.target.value), priceAsOf: null })} /></label>
                      <label className="field-label">Target weight (%)<input className="field mt-1.5" inputMode="decimal" value={h.targetWeightPct ?? ""} onChange={(e) => patchHolding(h.id, { targetWeightPct: numOrNull(e.target.value) })} /></label>
                      <label className="field-label">Annual distribution / share ($)<input className="field mt-1.5" inputMode="decimal" value={h.annualDistPerShare ?? ""} onChange={(e) => patchHolding(h.id, { annualDistPerShare: numOrNull(e.target.value) })} /></label>
                    </div>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <label className="field-label">Why do you own it?<textarea className="field mt-1.5 min-h-24" value={h.notes} onChange={(e) => patchHolding(h.id, { notes: e.target.value })} placeholder="One or two plain-English sentences." /></label>
                      <label className="field-label">Income / balance-sheet note<textarea className="field mt-1.5 min-h-24" value={h.coverageNote} onChange={(e) => patchHolding(h.id, { coverageNote: e.target.value })} placeholder="Only when income quality matters." /></label>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#27312B] pt-5">
                      <div className="text-sm text-mut">Weight {fmtPct(row?.weightPct ?? null)} · Target {fmtPct(h.targetWeightPct)} · Drift {drift === null ? "—" : `${drift >= 0 ? "+" : "−"}${Math.abs(drift).toFixed(1)}%`}</div>
                      <button type="button" className="btn-danger" onClick={() => removeHolding(h.id)}>Remove {h.ticker}</button>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
          {ps.unpricedTickers.length > 0 && <p className="mt-4 text-sm text-mut">Missing a usable price or share count: {ps.unpricedTickers.join(", ")}.</p>}
        </section>
      )}

      <section id="add-holding" className="border-t border-[#27312B] pt-10">
        <details open={state.holdings.length === 0}>
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between gap-4">
              <div><div className="page-kicker">Add to the long-term list</div><h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Add a holding</h2><p className="mt-2 text-sm text-mut">Start with the basics. The extra income and ETF fields can be left blank until they matter.</p></div>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#151B17] text-[#49695a]"><Plus size={18} /></span>
            </div>
          </summary>
          <div className="mt-7 rounded-[22px] bg-[#241C0E]/76 p-6 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="field-label">Ticker<input className="field mt-1.5" value={add.ticker} onChange={(e) => setAdd({ ...add, ticker: e.target.value })} placeholder="e.g. VUSA" /></label>
              <label className="field-label">What is it?<select className="field mt-1.5" value={add.type} onChange={(e) => setAdd({ ...add, type: e.target.value as Holding["type"] })}>{(["Stock", "ETF", "Fund", "Bond", "Cash", "Other"] as const).map((t) => <option key={t}>{t}</option>)}</select></label>
              <label className="field-label">Role in portfolio<select className="field mt-1.5" value={add.sleeve} onChange={(e) => setAdd({ ...add, sleeve: e.target.value as Sleeve })}>{(["Core", "Income", "Satellite", "Cash"] as Sleeve[]).map((s) => <option key={s}>{s}</option>)}</select></label>
              <label className="field-label">Shares<input className="field mt-1.5" inputMode="decimal" value={add.shares} onChange={(e) => setAdd({ ...add, shares: e.target.value })} /></label>
              <label className="field-label">Current price ($)<input className="field mt-1.5" inputMode="decimal" value={add.price} onChange={(e) => setAdd({ ...add, price: e.target.value })} /></label>
              <label className="field-label">Cost basis / share ($)<input className="field mt-1.5" inputMode="decimal" value={add.costBasis} onChange={(e) => setAdd({ ...add, costBasis: e.target.value })} /></label>
              <label className="field-label">Target weight (%)<input className="field mt-1.5" inputMode="decimal" value={add.targetWeightPct} onChange={(e) => setAdd({ ...add, targetWeightPct: e.target.value })} /></label>
              <label className="field-label">Annual distribution / share ($)<input className="field mt-1.5" inputMode="decimal" value={add.annualDistPerShare} onChange={(e) => setAdd({ ...add, annualDistPerShare: e.target.value })} /></label>
            </div>
            <details className="mt-5">
              <summary className="cursor-pointer text-sm font-semibold text-[#49695a]">Optional ETF and income fields</summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <label className="field-label">Expense ratio (%)<input className="field mt-1.5" inputMode="decimal" value={add.expenseRatioPct} onChange={(e) => setAdd({ ...add, expenseRatioPct: e.target.value })} /></label>
                <label className="field-label">Yield (%)<input className="field mt-1.5" inputMode="decimal" value={add.yieldPct} onChange={(e) => setAdd({ ...add, yieldPct: e.target.value })} /></label>
                <label className="field-label">Benchmark<input className="field mt-1.5" value={add.benchmark} onChange={(e) => setAdd({ ...add, benchmark: e.target.value })} placeholder="e.g. S&P 500" /></label>
              </div>
            </details>
            <button type="button" className="btn-primary mt-6" onClick={addHolding}>Add holding <Plus size={15} /></button>
          </div>
        </details>
      </section>
    </div>
  );
}
