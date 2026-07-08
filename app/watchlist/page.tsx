"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowRight, Bell, Check, ChevronDown, CircleHelp,
  Lightbulb, LockKeyhole, Plus, RefreshCw, Trash2,
} from "lucide-react";
import { checkAlerts, type FiredAlert } from "@/lib/engine/action";
import { evaluateGate } from "@/lib/engine/gate";
import { WATCH_METRICS, type WatchRule } from "@/lib/engine/types";
import { uid, update, useAppState } from "@/lib/store";

const numOrNull = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const REFRESH_SECS = 5 * 60;
const METRIC_LABELS: Record<string, string> = {
  price: "price",
  pct_change: "daily price change (%)",
  volume_x_avg: "volume versus average (×)",
  pct_from_52w_high: "distance from 52-week high (%)",
  rsi: "RSI",
};

function conditionText(rule: WatchRule) {
  const metric = METRIC_LABELS[rule.metric] ?? rule.metric;
  const op = rule.op === ">=" ? "reaches or rises above" : rule.op === "<=" ? "reaches or falls below" : rule.op === ">" ? "moves above" : "moves below";
  return `Tell me when ${metric} ${op} ${rule.value}`;
}

export default function WatchlistPage() {
  const state = useAppState();
  const gate = evaluateGate(state.gateInputs, state.settings, state.trades);
  const locked = gate.state === "NO NEW SWINGS";
  const [ruleDraft, setRuleDraft] = useState({ ticker: "", metric: "price", op: ">=" as WatchRule["op"], value: "", note: "" });
  const [digest, setDigest] = useState<FiredAlert[] | null>(null);
  const [ranAt, setRanAt] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchNote, setFetchNote] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_SECS);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchRef = useRef<() => void>(() => {});
  const tickers = [...new Set(state.watchRules.map((r) => r.ticker.toUpperCase()))];

  const addRule = () => {
    if (!ruleDraft.ticker.trim() || numOrNull(ruleDraft.value) === null) return;
    const rule: WatchRule = {
      id: uid("W"), ticker: ruleDraft.ticker.trim().toUpperCase(), metric: ruleDraft.metric,
      op: ruleDraft.op, value: numOrNull(ruleDraft.value) as number, note: ruleDraft.note,
    };
    update((prev) => ({ ...prev, watchRules: [...prev.watchRules, rule] }));
    setRuleDraft({ ...ruleDraft, ticker: "", value: "", note: "" });
  };

  const removeRule = (id: string) => update((prev) => ({ ...prev, watchRules: prev.watchRules.filter((r) => r.id !== id) }));
  const setDataValue = (ticker: string, metric: string, value: number | null) => update((prev) => {
    const rows = [...prev.watchData.rows];
    const i = rows.findIndex((r) => r.ticker === ticker);
    if (i >= 0) rows[i] = { ...rows[i], values: { ...rows[i].values, [metric]: value } };
    else rows.push({ ticker, values: { [metric]: value } });
    return { ...prev, watchData: { ...prev.watchData, rows } };
  });
  const setAsOf = (asOf: string) => update((prev) => ({ ...prev, watchData: { ...prev.watchData, asOf, source: prev.watchData.source || "manual entry" } }));

  const fetchData = async () => {
    if (tickers.length === 0) return;
    setFetching(true);
    setFetchNote("");
    try {
      const res = await fetch(`/api/quotes?mode=metrics&symbols=${encodeURIComponent(tickers.join(","))}`);
      if (!res.ok) throw new Error();
      const j = (await res.json()) as { quotes: Array<{ ticker: string; date: string | null; metrics?: Record<string, number | null> }> };
      let got = 0;
      let latestDate: string | null = null;
      update((prev) => {
        const rows = [...prev.watchData.rows];
        for (const q of j.quotes) {
          if (!q.metrics) continue;
          got++;
          if (q.date && (!latestDate || q.date > latestDate)) latestDate = q.date;
          const ticker = q.ticker.toUpperCase();
          const values = {
            price: q.metrics.price ?? null,
            pct_change: q.metrics.pct_change ?? null,
            volume_x_avg: q.metrics.volume_x_avg ?? null,
            pct_from_52w_high: q.metrics.pct_from_52w_high ?? null,
            rsi: q.metrics.rsi ?? null,
          };
          const i = rows.findIndex((r) => r.ticker === ticker);
          if (i >= 0) rows[i] = { ...rows[i], values: { ...rows[i].values, ...values } };
          else rows.push({ ticker, values });
        }
        return { ...prev, watchData: { rows, asOf: latestDate ? `${latestDate} EOD` : prev.watchData.asOf, source: "Stooq (delayed EOD)" } };
      });
      const failed = j.quotes.filter((q) => !q.metrics).map((q) => q.ticker);
      setFetchNote(`Updated ${got}/${tickers.length}${failed.length ? ` · enter manually: ${failed.join(", ")}` : ""}`);
    } catch {
      setFetchNote("Could not update prices. Manual entry still works.");
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => { fetchRef.current = fetchData; });
  useEffect(() => {
    if (!autoRefresh || tickers.length === 0) {
      if (countdownRef.current) clearInterval(countdownRef.current);
      setCountdown(REFRESH_SECS);
      return;
    }
    setCountdown(REFRESH_SECS);
    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { fetchRef.current(); return REFRESH_SECS; }
        return c - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [autoRefresh, tickers.length]);

  const runCheck = () => {
    setDigest(checkAlerts(state.watchRules, state.watchData));
    setRanAt(new Date().toLocaleString());
  };

  const updateAndCheck = async () => {
    await fetchData();
    setTimeout(runCheck, 0);
  };
  const firedAlerts = digest?.filter((a) => a.fired) ?? [];

  return (
    <div>
      <section className={`mb-10 rounded-[26px] p-6 sm:p-9 ${locked ? "bg-[#f6e8e3]" : "bg-[#e7eee8]"}`}>
        {locked ? <LockKeyhole size={25} className="text-[#a45645]" /> : <Lightbulb size={25} className="text-[#456555]" />}
        <h2 className="mt-5 max-w-3xl font-display text-[2.35rem] font-semibold leading-[1.04] tracking-[-0.04em] sm:text-[3.4rem]">
          {locked ? "New trade ideas can wait today." : "Keep ideas here until the facts earn your attention."}
        </h2>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-mut">
          {locked ? "Your risk check currently says no new swing trades. You can review existing notes, but AXIOM is intentionally not encouraging candidate discovery." : "This is not a stock screener or a hot list. Add a company only when you already know what fact would make it worth a closer look."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/gate" className="quiet-link">See today's risk answer <ArrowRight size={14} /></Link>
          {!locked && state.watchRules.length > 0 && <button type="button" className="btn-primary" onClick={() => void updateAndCheck()} disabled={fetching}><RefreshCw size={15} />{fetching ? "Checking…" : "Check my ideas"}</button>}
        </div>
      </section>

      {firedAlerts.length > 0 && (
        <section className="mb-12">
          <div className="page-kicker">Worth a closer look</div>
          <h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">{firedAlerts.length} condition{firedAlerts.length === 1 ? " has" : "s have"} been met</h2>
          <p className="mt-3 text-sm leading-relaxed text-mut">A condition firing is a fact, not a buy signal. The next step is to review the idea and plan risk.</p>
          <div className="mt-5 divide-y divide-[#d9d2c6] border-y border-[#d9d2c6]">
            {firedAlerts.map((a) => (
              <div key={a.rule.id} className="grid gap-3 py-5 sm:grid-cols-[44px_1fr_auto] sm:items-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f2eadb] text-[#9d6a2c]"><Bell size={18} /></span>
                <div><div className="text-[17px] font-semibold">{a.rule.ticker}</div><p className="mt-1 text-sm text-mut">{conditionText(a.rule)}. Current reading: {a.current ?? "not available"}.{a.rule.note ? ` ${a.rule.note}` : ""}</p></div>
                <Link href="/charts" className="quiet-link">Review the evidence <ArrowRight size={14} /></Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mb-12">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="page-kicker">Your short list</div><h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Trade ideas</h2><p className="mt-2 text-sm text-mut">Each idea needs one measurable reason to come back and look again.</p></div>
          {state.watchRules.length > 0 && <div className="text-sm text-mut">{state.watchRules.length} alert rule{state.watchRules.length === 1 ? "" : "s"} across {tickers.length} ticker{tickers.length === 1 ? "" : "s"}</div>}
        </div>

        {state.watchRules.length === 0 ? (
          <div className="border-y border-[#d9d2c6] py-8">
            <div className="max-w-2xl">
              <CircleHelp size={22} className="text-[#7b837e]" />
              <h3 className="mt-4 font-display text-[1.8rem] font-semibold tracking-[-0.03em]">What belongs here?</h3>
              <p className="mt-3 text-sm leading-relaxed text-mut">Example: “Look at ABC again if the price reaches 52” or “Review XYZ if volume rises above 1.5× average.” The alert tells you a fact changed; it never tells you to trade.</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#d9d2c6] border-y border-[#d9d2c6]">
            {state.watchRules.map((rule) => {
              const current = state.watchData.rows.find((r) => r.ticker === rule.ticker)?.values[rule.metric] ?? null;
              const alert = digest?.find((a) => a.rule.id === rule.id);
              return (
                <div key={rule.id} className="grid gap-4 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-3"><span className="text-[18px] font-bold">{rule.ticker}</span>{alert?.fired && <span className="badge bg-[#f2eadb] text-[#9d6a2c]">Condition met</span>}</div>
                    <p className="mt-1 text-sm text-mut">{conditionText(rule)}{rule.note ? ` · ${rule.note}` : ""}</p>
                    <p className="mt-1 text-xs text-faint">Latest saved {METRIC_LABELS[rule.metric] ?? rule.metric}: {current ?? "not available"}</p>
                  </div>
                  <button type="button" className="btn-ghost text-[#98493e]" onClick={() => removeRule(rule.id)}><Trash2 size={15} />Remove</button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {!locked && (
        <section className="mb-12 rounded-[24px] bg-[#fffdf8]/76 p-6 sm:p-8">
          <div className="max-w-2xl">
            <div className="page-kicker">Add one clear reason to look again</div>
            <h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Add a trade idea</h2>
            <p className="mt-3 text-sm leading-relaxed text-mut">Keep the condition mechanical. You can do the actual chart and trade-plan work later, only if the condition is met.</p>
          </div>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="field-label">Ticker<input className="field mt-1.5" value={ruleDraft.ticker} onChange={(e) => setRuleDraft({ ...ruleDraft, ticker: e.target.value })} placeholder="e.g. MSFT" /></label>
            <label className="field-label">What should change?<select className="field mt-1.5" value={ruleDraft.metric} onChange={(e) => setRuleDraft({ ...ruleDraft, metric: e.target.value })}>{WATCH_METRICS.map((m) => <option key={m} value={m}>{METRIC_LABELS[m] ?? m}</option>)}</select></label>
            <label className="field-label">Direction<select className="field mt-1.5" value={ruleDraft.op} onChange={(e) => setRuleDraft({ ...ruleDraft, op: e.target.value as WatchRule["op"] })}><option value=">=">Reaches or rises above</option><option value="<=">Reaches or falls below</option><option value=">">Moves above</option><option value="<">Moves below</option></select></label>
            <label className="field-label">Level<input className="field mt-1.5" inputMode="decimal" value={ruleDraft.value} onChange={(e) => setRuleDraft({ ...ruleDraft, value: e.target.value })} placeholder="e.g. 52" /></label>
          </div>
          <label className="field-label mt-4">Why is this level worth revisiting?<input className="field mt-1.5" value={ruleDraft.note} onChange={(e) => setRuleDraft({ ...ruleDraft, note: e.target.value })} placeholder="One short note, e.g. prior breakout level" /></label>
          <button type="button" className="btn-primary mt-6" onClick={addRule}>Add idea <Plus size={15} /></button>
        </section>
      )}

      {state.watchRules.length > 0 && (
        <section className="border-t border-[#d7d0c4] pt-10">
          <details>
            <summary className="cursor-pointer list-none">
              <div className="flex items-center justify-between gap-4">
                <div><div className="page-kicker">Advanced</div><h2 className="mt-1 font-display text-[1.8rem] font-semibold tracking-[-0.03em]">Data and automatic refresh</h2><p className="mt-2 text-sm text-mut">Use this only when you need to inspect or override the delayed market data behind your alert rules.</p></div>
                <ChevronDown size={20} className="shrink-0 text-faint" />
              </div>
            </summary>
            <div className="mt-7 rounded-[22px] bg-[#fffdf8]/76 p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn" onClick={() => void fetchData()} disabled={fetching}><RefreshCw size={15} />{fetching ? "Updating…" : "Update data"}</button>
                <button type="button" className="btn" onClick={runCheck}>Run alert check</button>
                <label className="flex items-center gap-2 text-sm font-semibold text-mut"><input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />Auto-refresh every 5 minutes{autoRefresh ? ` (${Math.floor(countdown / 60)}:${String(countdown % 60).padStart(2, "0")})` : ""}</label>
              </div>
              {fetchNote && <p className="mt-3 text-sm text-mut" role="status">{fetchNote}</p>}
              <label className="field-label mt-5 max-w-md">Data as of<input className="field mt-1.5" value={state.watchData.asOf} onChange={(e) => setAsOf(e.target.value)} placeholder="e.g. 2026-07-07 EOD" /></label>
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left">
                  <thead><tr className="eyebrow"><th className="cell font-normal">Ticker</th>{WATCH_METRICS.map((m) => <th key={m} className="cell font-normal">{METRIC_LABELS[m] ?? m}</th>)}</tr></thead>
                  <tbody>{tickers.map((ticker) => {
                    const row = state.watchData.rows.find((r) => r.ticker === ticker);
                    return <tr key={ticker}><td className="cell font-semibold">{ticker}</td>{WATCH_METRICS.map((m) => <td key={m} className="cell"><input className="field !w-24 !py-1.5" inputMode="decimal" value={row?.values[m] ?? ""} onChange={(e) => setDataValue(ticker, m, numOrNull(e.target.value))} /></td>)}</tr>;
                  })}</tbody>
                </table>
              </div>
              {digest && <p className="mt-4 text-sm text-mut">Last alert check: {ranAt}{state.watchData.asOf ? ` · data ${state.watchData.asOf}` : ""}. {digest.filter((a) => a.awaiting).length} rule{digest.filter((a) => a.awaiting).length === 1 ? " is" : "s are"} awaiting data.</p>}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
