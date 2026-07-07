"use client";

import { useState } from "react";
import { AllocationDonut } from "@/components/charts";
import { fmtPct, fmtUsd, Panel, Stat } from "@/components/chrome";
import { downloadText, exportPortfolioCsv } from "@/lib/csv";
import { portfolioStats } from "@/lib/engine/stats";
import {
  ACTIONS,
  GRADES,
  THESIS_STATUSES,
  type Grade,
  type Holding,
  type HoldingAction,
  type Sleeve,
  type ThesisStatus,
} from "@/lib/engine/types";
import { isoWeekKey, uid, update, useAppState } from "@/lib/store";

const numOrNull = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const WEEKLY_STEPS = [
  "Reconcile holdings, market values, weights, and forward income.",
  "Review sleeve drift: Core, Income, Satellite, Cash. Rebalance by rule, not by headline.",
  "For each holding: role intact? thesis intact? benchmark still appropriate? concentration acceptable?",
  "Dividend holdings: update annual dividend, coverage grade, debt/liquidity grade, dividend-trend grade.",
  "ETFs: mandate, index fit, expense-ratio changes, distribution pattern, concentration, simpler overlap?",
  "Compare portfolio vs benchmark and write the reason for any gap (allocation, selection, cash drag, costs, tax).",
  "Make at most three portfolio actions for the coming week. \u201cNo action\u201d is valid.",
];

const emptyAdd = {
  ticker: "",
  type: "ETF" as Holding["type"],
  sleeve: "Core" as Sleeve,
  shares: "",
  costBasis: "",
  price: "",
  targetWeightPct: "",
  expenseRatioPct: "",
  yieldPct: "",
  annualDistPerShare: "",
  benchmark: "",
};

export default function PortfolioPage() {
  const state = useAppState();
  const ps = portfolioStats(state.holdings);
  const weekTag = isoWeekKey();
  const reviewed = state.weeklyReviews.includes(weekTag);
  const [add, setAdd] = useState(emptyAdd);
  const [priceNotice, setPriceNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const refreshPrices = async () => {
    const tickers = [...new Set(state.holdings.map((h) => h.ticker).filter(Boolean))];
    if (tickers.length === 0) return;
    setRefreshing(true);
    setPriceNotice("");
    try {
      const res = await fetch(`/api/quotes?mode=close&symbols=${encodeURIComponent(tickers.join(","))}`);
      if (!res.ok) throw new Error();
      const j = (await res.json()) as { quotes: Array<{ ticker: string; close: number | null; date: string | null; error?: string }> };
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
      setPriceNotice(
        `Updated ${updated}/${tickers.length}${asOf ? ` · closes as of ${asOf}` : ""} · Stooq delayed EOD` +
          (failed.length ? ` · not found (enter manually): ${failed.join(", ")}` : ""),
      );
    } catch {
      setPriceNotice("Couldn't fetch prices — server or data source unreachable. Manual entry still works.");
    } finally {
      setRefreshing(false);
    }
  };
  const [checked, setChecked] = useState<boolean[]>(WEEKLY_STEPS.map(() => false));

  const plannedActions = state.holdings.filter((h) => h.action && h.action !== "Hold" && h.action !== "Watch").length;

  const addHolding = () => {
    if (!add.ticker.trim()) return;
    const h: Holding = {
      id: uid("H"),
      ticker: add.ticker.trim().toUpperCase(),
      type: add.type,
      sleeve: add.sleeve,
      shares: numOrNull(add.shares),
      costBasis: numOrNull(add.costBasis),
      price: numOrNull(add.price),
      targetWeightPct: numOrNull(add.targetWeightPct),
      expenseRatioPct: numOrNull(add.expenseRatioPct),
      yieldPct: numOrNull(add.yieldPct),
      payoutRatioPct: null,
      annualDistPerShare: numOrNull(add.annualDistPerShare),
      benchmark: add.benchmark,
      thesisStatus: "Intact",
      payoutGrade: "",
      coverageNote: "",
      action: "Hold",
      notes: "",
    };
    update((prev) => ({ ...prev, holdings: [...prev.holdings, h] }));
    setAdd(emptyAdd);
  };

  const patchHolding = (id: string, patch: Partial<Holding>) =>
    update((prev) => ({
      ...prev,
      holdings: prev.holdings.map((h) => (h.id === id ? { ...h, ...patch } : h)),
    }));

  const removeHolding = (id: string) =>
    update((prev) => ({ ...prev, holdings: prev.holdings.filter((h) => h.id !== id) }));

  const markReviewed = () =>
    update((prev) => ({
      ...prev,
      weeklyReviews: prev.weeklyReviews.includes(weekTag) ? prev.weeklyReviews : [...prev.weeklyReviews, weekTag],
    }));

  return (
    <div className="grid gap-3">
      {state.holdings.length > 0 && (
        <div className="grid gap-3 md:grid-cols-3">
          <Panel eyebrow="By sleeve" title="Allocation">
            <AllocationDonut holdings={state.holdings} />
            <div className="mt-2 grid gap-1">
              {["Core","Income","Satellite","Cash"].map((s) => {
                const mv = state.holdings.filter(h=>h.sleeve===s).reduce((a,h)=>a+(h.price??0)*(h.shares??0),0);
                const tot = ps.totalMarketValue;
                return mv>0 ? <div key={s} className="flex justify-between font-mono text-[11px]"><span className="text-mut">{s}</span><span className="text-ink">{tot>0?((mv/tot)*100).toFixed(1):0}%</span></div> : null;
              })}
            </div>
          </Panel>
          <div className="md:col-span-2 grid grid-cols-2 gap-2 content-start">
            <Stat label="Market value" value={fmtUsd(ps.totalMarketValue)} />
            <Stat label="Forward income" value={fmtUsd(ps.forwardIncome)} />
            <Stat label="Portfolio yield" value={fmtPct(ps.portfolioYieldPct)} />
            <Stat label="Top-3 income conc." value={fmtPct(ps.top3IncomeConcPct, 0)} />
            <Stat label="Top weight" value={ps.topWeightTicker ? `${ps.topWeightTicker} ${fmtPct(ps.topWeightPct)}` : "—"} />
            <Stat label="Weighted expense" value={fmtPct(ps.weightedExpensePct, 2)} />
          </div>
        </div>
      )}

      <Panel
        eyebrow="Weekly long-term review"
        title={reviewed ? `Reviewed this week (${weekTag})` : `Due this week (${weekTag})`}
        right={
          <button type="button" className="btn-gate" onClick={markReviewed} disabled={reviewed}>
            {reviewed ? "Done" : "Mark week reviewed"}
          </button>
        }
      >
        <ol className="grid gap-1.5">
          {WEEKLY_STEPS.map((step, i) => (
            <li key={step} className="flex items-start gap-2 text-xs text-mut">
              <input
                type="checkbox"
                className="mt-0.5 accent-[var(--gate)]"
                checked={checked[i]}
                onChange={() => setChecked((prev) => prev.map((c, j) => (j === i ? !c : c)))}
                aria-label={`Step ${i + 1}`}
              />
              <span className={checked[i] ? "text-faint line-through" : ""}>{step}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[11px] text-faint">
          Price movement is one input. Forward income is an output; yield alone is not a quality score.
        </p>
      </Panel>

      <Panel
        eyebrow={`${state.holdings.length} holdings`}
        title="Holdings ledger"
        right={
          <div className="flex gap-2">
            <button type="button" className="btn-gate" onClick={() => void refreshPrices()} disabled={refreshing || state.holdings.length === 0}>
              {refreshing ? "Fetching…" : "Refresh prices"}
            </button>
            <button type="button" className="btn" onClick={() => downloadText("portfolio.csv", exportPortfolioCsv(state.holdings))}>
              Export ledger CSV
            </button>
          </div>
        }
      >
        {state.holdings.length === 0 ? (
          <p className="text-xs text-faint">Add your long-term holdings below. Blank cells are honest — the stats compute on the priced subset and list what&apos;s missing.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="eyebrow">
                  <th className="cell font-normal">Ticker</th>
                  <th className="cell font-normal">Sleeve</th>
                  <th className="cell font-normal">Shares</th>
                  <th className="cell font-normal">Price</th>
                  <th className="cell font-normal">Weight</th>
                  <th className="cell font-normal">Target</th>
                  <th className="cell font-normal">Drift</th>
                  <th className="cell hidden font-normal md:table-cell">Income</th>
                  <th className="cell hidden font-normal md:table-cell">Thesis</th>
                  <th className="cell hidden font-normal lg:table-cell">Grade</th>
                  <th className="cell font-normal">Action</th>
                  <th className="cell font-normal" />
                </tr>
              </thead>
              <tbody>
                {state.holdings.map((h) => {
                  const row = ps.rows.find((r) => r.id === h.id);
                  const drift = row?.driftPct ?? null;
                  return (
                    <tr key={h.id} className="hover:bg-panel2">
                      <td className="cell">{h.ticker}</td>
                      <td className="cell">
                        <select className="field !w-auto !py-0.5" value={h.sleeve} onChange={(e) => patchHolding(h.id, { sleeve: e.target.value as Sleeve })}>
                          {(["Core", "Income", "Satellite", "Cash"] as Sleeve[]).map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td className="cell">
                        <input className="field !w-20 !py-0.5" inputMode="decimal" value={h.shares ?? ""} onChange={(e) => patchHolding(h.id, { shares: numOrNull(e.target.value) })} />
                      </td>
                      <td className="cell">
                        <input className="field !w-20 !py-0.5" inputMode="decimal" title={h.priceAsOf ?? undefined} value={h.price ?? ""} onChange={(e) => patchHolding(h.id, { price: numOrNull(e.target.value), priceAsOf: null })} />
                      </td>
                      <td className="cell text-mut">{fmtPct(row?.weightPct ?? null)}</td>
                      <td className="cell">
                        <input className="field !w-16 !py-0.5" inputMode="decimal" value={h.targetWeightPct ?? ""} onChange={(e) => patchHolding(h.id, { targetWeightPct: numOrNull(e.target.value) })} />
                      </td>
                      <td className="cell font-semibold" style={{ color: drift === null ? undefined : Math.abs(drift) > 5 ? "#E7A83E" : "#7E8C99" }}>
                        {drift === null ? "—" : `${drift >= 0 ? "+" : "−"}${Math.abs(drift).toFixed(1)}%`}
                      </td>
                      <td className="cell hidden text-mut md:table-cell">{fmtUsd(row?.incomeUsd ?? null)}</td>
                      <td className="cell hidden md:table-cell">
                        <select className="field !w-auto !py-0.5" value={h.thesisStatus} onChange={(e) => patchHolding(h.id, { thesisStatus: e.target.value as ThesisStatus })}>
                          <option value="">—</option>
                          {THESIS_STATUSES.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td className="cell hidden lg:table-cell">
                        <select className="field !w-auto !py-0.5" value={h.payoutGrade} onChange={(e) => patchHolding(h.id, { payoutGrade: e.target.value as Grade })}>
                          <option value="">—</option>
                          {GRADES.map((g) => (
                            <option key={g}>{g}</option>
                          ))}
                        </select>
                      </td>
                      <td className="cell">
                        <select className="field !w-auto !py-0.5" value={h.action} onChange={(e) => patchHolding(h.id, { action: e.target.value as HoldingAction })}>
                          <option value="">—</option>
                          {ACTIONS.map((a) => (
                            <option key={a}>{a}</option>
                          ))}
                        </select>
                      </td>
                      <td className="cell">
                        <button type="button" className="btn !px-1.5" aria-label={`Remove ${h.ticker}`} onClick={() => removeHolding(h.id)}>
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {priceNotice && <p className="mt-2 font-mono text-[11px] text-mut" role="status">{priceNotice}</p>}
        <p className="mt-2 text-[11px] text-faint">Bare tickers assume US listings (AAPL → aapl.us); gold/silver and crypto quote as pairs (XAUUSD, XAGUSD, BTCUSD, ETHUSD); other markets use Stooq suffixes (VUSA.UK). Delayed end-of-day data.</p>
        {ps.unpricedTickers.length > 0 && (
          <p className="mt-2 font-mono text-[11px] text-faint">Awaiting prices/shares: {ps.unpricedTickers.join(", ")}</p>
        )}
        <p className="mt-2 text-[11px] text-faint">
          Symbols for fetching: bare US tickers (AAPL, SPY) · other markets with suffix (vusa.uk) · gold xauusd ·
          crypto btcusd, ethusd. Manual entry always overrides.
        </p>
      </Panel>

      <Panel eyebrow="Add holding" title="New position in the long-term sleeve">
        <div className="grid gap-2 sm:grid-cols-5">
          <label className="grid gap-1 text-xs text-mut">
            Ticker
            <input className="field" value={add.ticker} onChange={(e) => setAdd({ ...add, ticker: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Type
            <select className="field" value={add.type} onChange={(e) => setAdd({ ...add, type: e.target.value as Holding["type"] })}>
              {(["Stock", "ETF", "Fund", "Bond", "Cash", "Other"] as const).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Sleeve
            <select className="field" value={add.sleeve} onChange={(e) => setAdd({ ...add, sleeve: e.target.value as Sleeve })}>
              {(["Core", "Income", "Satellite", "Cash"] as Sleeve[]).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Shares
            <input className="field" inputMode="decimal" value={add.shares} onChange={(e) => setAdd({ ...add, shares: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Price ($)
            <input className="field" inputMode="decimal" value={add.price} onChange={(e) => setAdd({ ...add, price: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Cost basis / share ($)
            <input className="field" inputMode="decimal" value={add.costBasis} onChange={(e) => setAdd({ ...add, costBasis: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Target weight (%)
            <input className="field" inputMode="decimal" value={add.targetWeightPct} onChange={(e) => setAdd({ ...add, targetWeightPct: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Expense ratio (%)
            <input className="field" inputMode="decimal" value={add.expenseRatioPct} onChange={(e) => setAdd({ ...add, expenseRatioPct: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Yield (%)
            <input className="field" inputMode="decimal" value={add.yieldPct} onChange={(e) => setAdd({ ...add, yieldPct: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Annual dist. / share ($)
            <input className="field" inputMode="decimal" value={add.annualDistPerShare} onChange={(e) => setAdd({ ...add, annualDistPerShare: e.target.value })} />
          </label>
        </div>
        <button type="button" className="btn-gate mt-2" onClick={addHolding}>
          Add holding
        </button>
        <p className="mt-2 text-[11px] text-faint">
          Bare tickers assume a US listing (AAPL → aapl.us). For anything else use the Stooq form — vusa.uk,
          xauusd for gold bullion (GOLD is Barrick&apos;s ticker), btcusd, ethusd — or enter prices manually.
        </p>
      </Panel>
    </div>
  );
}
