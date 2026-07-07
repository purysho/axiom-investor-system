"use client";

import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/chrome";
import { checkAlerts, type FiredAlert } from "@/lib/engine/action";
import { WATCH_METRICS, type WatchRule } from "@/lib/engine/types";
import { uid, update, useAppState } from "@/lib/store";

const numOrNull = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const REFRESH_SECS = 5 * 60; // 5-minute auto-refresh

export default function WatchlistPage() {
  const state = useAppState();
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

  // keep fetchRef current so the interval can call the latest version
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

  const addRule = () => {
    if (!ruleDraft.ticker.trim() || numOrNull(ruleDraft.value) === null) return;
    const rule: WatchRule = {
      id: uid("W"),
      ticker: ruleDraft.ticker.trim().toUpperCase(),
      metric: ruleDraft.metric,
      op: ruleDraft.op,
      value: numOrNull(ruleDraft.value) as number,
      note: ruleDraft.note,
    };
    update((prev) => ({ ...prev, watchRules: [...prev.watchRules, rule] }));
    setRuleDraft({ ...ruleDraft, ticker: "", value: "", note: "" });
  };

  const removeRule = (id: string) =>
    update((prev) => ({ ...prev, watchRules: prev.watchRules.filter((r) => r.id !== id) }));

  const setDataValue = (ticker: string, metric: string, value: number | null) =>
    update((prev) => {
      const rows = [...prev.watchData.rows];
      const i = rows.findIndex((r) => r.ticker === ticker);
      if (i >= 0) rows[i] = { ...rows[i], values: { ...rows[i].values, [metric]: value } };
      else rows.push({ ticker, values: { [metric]: value } });
      return { ...prev, watchData: { ...prev.watchData, rows } };
    });

  const setAsOf = (asOf: string) =>
    update((prev) => ({ ...prev, watchData: { ...prev.watchData, asOf, source: prev.watchData.source || "manual entry" } }));

  const fetchData = async () => {
    if (tickers.length === 0) return;
    setFetching(true);
    setFetchNote("");
    try {
      const res = await fetch(`/api/quotes?mode=metrics&symbols=${encodeURIComponent(tickers.join(","))}`);
      if (!res.ok) throw new Error();
      const j = (await res.json()) as {
        quotes: Array<{ ticker: string; date: string | null; metrics?: Record<string, number | null>; error?: string }>;
      };
      let got = 0;
      let latestDate: string | null = null;
      update((prev) => {
        const rows = [...prev.watchData.rows];
        for (const q of j.quotes) {
          if (!q.metrics) continue;
          got++;
          if (q.date && (!latestDate || q.date > latestDate)) latestDate = q.date;
          const t = q.ticker.toUpperCase();
          const values = {
            price: q.metrics.price ?? null,
            pct_change: q.metrics.pct_change ?? null,
            volume_x_avg: q.metrics.volume_x_avg ?? null,
            pct_from_52w_high: q.metrics.pct_from_52w_high ?? null,
            rsi: q.metrics.rsi ?? null,
          };
          const i = rows.findIndex((r) => r.ticker === t);
          if (i >= 0) rows[i] = { ...rows[i], values: { ...rows[i].values, ...values } };
          else rows.push({ ticker: t, values });
        }
        return {
          ...prev,
          watchData: {
            rows,
            asOf: latestDate ? `${latestDate} EOD` : prev.watchData.asOf,
            source: "Stooq (delayed EOD)",
          },
        };
      });
      const failed = j.quotes.filter((q) => !q.metrics).map((q) => q.ticker);
      setFetchNote(
        `Fetched ${got}/${tickers.length} · Stooq delayed EOD` +
          (failed.length ? ` · not found (enter manually): ${failed.join(", ")}` : ""),
      );
    } catch {
      setFetchNote("Couldn't fetch — server or data source unreachable. Manual entry still works.");
    } finally {
      setFetching(false);
    }
  };

  const runCheck = () => {
    setDigest(checkAlerts(state.watchRules, state.watchData));
    setRanAt(new Date().toLocaleString());
  };

  const firedAlerts = digest?.filter((a) => a.fired) ?? [];

  return (
    <div className="grid gap-3">
      {firedAlerts.length > 0 && (
        <section className="panel border-l-4 p-3" style={{ borderLeftColor: "#E7A83E" }}>
          <div className="eyebrow" style={{ color: "#E7A83E" }}>
            {firedAlerts.length} alert{firedAlerts.length > 1 ? "s" : ""} fired
          </div>
          <ul className="mt-1 grid gap-1 font-mono text-xs text-ink">
            {firedAlerts.map((a) => (
              <li key={a.rule.id}>
                ● {a.rule.ticker} {a.rule.metric} {a.rule.op} {a.rule.value}
                {a.current !== null && <span className="text-mut"> — now {a.current}</span>}
                {a.rule.note && <span className="text-faint"> ({a.rule.note})</span>}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] text-faint">Facts, not directives — check the gate before acting.</p>
        </section>
      )}

      <Panel eyebrow="On-demand digest — not a background service" title="Watchlist & alerts">
        <p className="text-xs leading-relaxed text-mut">
          Rules persist; alerts are regenerated each check against the latest data you enter (or paste from a
          broker/screener export). Nothing here watches the market while you&apos;re away — the Discord bot is the
          planned always-on component. A fired rule is a fact (a metric crossed a level), never a directive.
        </p>
      </Panel>

      <Panel
        eyebrow={`${state.watchRules.length} rules`}
        title="Rules ledger"
        right={
          <div className="flex gap-2">
            <button type="button" className="btn-gate" onClick={() => void fetchData()} disabled={fetching || tickers.length === 0}>
              {fetching ? "Fetching…" : "Fetch now"}
            </button>
            <label className="flex items-center gap-2 font-mono text-[11px] text-mut cursor-pointer">
              <input type="checkbox" className="accent-[var(--gate)]" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} disabled={tickers.length === 0} />
              Auto-refresh
              {autoRefresh && <span className="text-faint">({Math.floor(countdown/60)}:{String(countdown%60).padStart(2,"0")})</span>}
            </label>
            <button type="button" className="btn" onClick={() => void fetchData()} disabled={fetching || tickers.length === 0}>
              {fetching ? "Fetching…" : "Fetch data"}
            </button>
            <button type="button" className="btn-gate" onClick={runCheck} disabled={state.watchRules.length === 0}>
              Run check
            </button>
          </div>
        }
      >
        {state.watchRules.length > 0 && (
          <table className="mb-3 w-full text-left">
            <thead>
              <tr className="eyebrow">
                <th className="cell font-normal">Ticker</th>
                <th className="cell font-normal">Condition</th>
                <th className="cell hidden font-normal sm:table-cell">Note</th>
                <th className="cell font-normal" />
              </tr>
            </thead>
            <tbody>
              {state.watchRules.map((r) => (
                <tr key={r.id} className="hover:bg-panel2">
                  <td className="cell">{r.ticker}</td>
                  <td className="cell text-mut">
                    {r.metric} {r.op} {r.value}
                  </td>
                  <td className="cell hidden text-faint sm:table-cell">{r.note}</td>
                  <td className="cell">
                    <button type="button" className="btn !px-1.5" aria-label="Remove rule" onClick={() => removeRule(r.id)}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="grid gap-2 sm:grid-cols-5">
          <label className="grid gap-1 text-xs text-mut">
            Ticker
            <input className="field" value={ruleDraft.ticker} onChange={(e) => setRuleDraft({ ...ruleDraft, ticker: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Metric
            <select className="field" value={ruleDraft.metric} onChange={(e) => setRuleDraft({ ...ruleDraft, metric: e.target.value })}>
              {WATCH_METRICS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Op
            <select className="field" value={ruleDraft.op} onChange={(e) => setRuleDraft({ ...ruleDraft, op: e.target.value as WatchRule["op"] })}>
              {[">", "<", ">=", "<="].map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Value
            <input className="field" inputMode="decimal" value={ruleDraft.value} onChange={(e) => setRuleDraft({ ...ruleDraft, value: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Note
            <input className="field" value={ruleDraft.note} placeholder="near highs" onChange={(e) => setRuleDraft({ ...ruleDraft, note: e.target.value })} />
          </label>
        </div>
        <button type="button" className="btn mt-2" onClick={addRule}>
          Add rule
        </button>
        {fetchNote && <p className="mt-2 font-mono text-[11px] text-mut" role="status">{fetchNote}</p>}
      </Panel>

      {tickers.length > 0 && (
        <Panel
          eyebrow="Transient — overwritten each check"
          title="Latest data"
          right={
            <input
              className="field !w-52"
              placeholder="as of (e.g. 2026-07-07 16:00 ET)"
              value={state.watchData.asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="eyebrow">
                  <th className="cell font-normal">Ticker</th>
                  {WATCH_METRICS.map((m) => (
                    <th key={m} className="cell font-normal">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tickers.map((t) => {
                  const row = state.watchData.rows.find((r) => r.ticker === t);
                  return (
                    <tr key={t}>
                      <td className="cell">{t}</td>
                      {WATCH_METRICS.map((m) => (
                        <td key={m} className="cell">
                          <input
                            className="field !w-20 !py-0.5"
                            inputMode="decimal"
                            value={row?.values[m] ?? ""}
                            onChange={(e) => setDataValue(t, m, numOrNull(e.target.value))}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-faint">
            Fetch data fills every column from Stooq (bare US tickers, vusa.uk-style suffixes, xauusd, btcusd);
            manual entry overrides any cell. Blank = awaiting data.
          </p>
        </Panel>
      )}

      {digest && (
        <Panel eyebrow={`Checked ${ranAt}${state.watchData.asOf ? ` · data as of ${state.watchData.asOf}` : ""}`} title="Alerts — latest check">
          {digest.length === 0 ? (
            <p className="text-xs text-faint">No rules to check.</p>
          ) : (
            <ul className="grid gap-1 font-mono text-xs">
              {digest.map((a) => (
                <li key={a.rule.id} className={a.fired ? "text-ink" : "text-faint"}>
                  <span style={{ color: a.fired ? "var(--gate)" : undefined }}>{a.fired ? "● FIRED " : a.awaiting ? "○ AWAITING DATA " : "○ quiet "}</span>
                  {a.rule.ticker} {a.rule.metric} {a.rule.op} {a.rule.value}
                  {a.current !== null && ` — current ${a.current}`}
                  {a.rule.note && ` (${a.rule.note})`}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-faint">
            Facts, not directives. A candidate worth acting on goes to the gate and sizing first — that&apos;s where
            it becomes a plan.
          </p>
        </Panel>
      )}
    </div>
  );
}
