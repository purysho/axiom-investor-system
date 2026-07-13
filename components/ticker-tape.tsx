"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { usePolling } from "@/lib/use-polling";

/**
 * The LED market strip under the header — a scrolling ticker of live-ish
 * quotes (delayed EOD, or real when Alpaca data keys are set). Green up, red
 * down, monospace, tabular. Visibility-aware polling; degrades to nothing
 * when the feed is unreachable so it never blocks a page.
 */

const TAPE: Array<{ sym: string; label: string }> = [
  { sym: "SPY", label: "S&P 500" },
  { sym: "QQQ", label: "NASDAQ" },
  { sym: "DIA", label: "DOW" },
  { sym: "IWM", label: "RUSSELL" },
  { sym: "TLT", label: "20Y TSY" },
  { sym: "BTCUSD", label: "BTC" },
  { sym: "ETHUSD", label: "ETH" },
  { sym: "XAUUSD", label: "GOLD" },
  { sym: "EURUSD", label: "EUR/USD" },
];

interface Quote { ticker: string; close: number | null; metrics?: { pct_change: number | null } }

const fmtPrice = (n: number) =>
  n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: n < 10 ? 4 : 2 });

export function TickerTape() {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/quotes?mode=metrics&symbols=${TAPE.map((t) => t.sym).join(",")}`);
      if (!res.ok) return;
      const j = (await res.json()) as { quotes?: Quote[] };
      const map: Record<string, Quote> = {};
      for (const q of j.quotes ?? []) map[q.ticker.toUpperCase()] = q;
      setQuotes(map);
    } catch { /* leave the last snapshot */ }
  }, []);
  usePolling(refresh, 90_000);

  const items = TAPE.map((t) => ({ ...t, q: quotes[t.sym.toUpperCase()] })).filter((t) => t.q?.close != null);
  if (items.length === 0) return null;

  // Duplicate the row so the marquee loop is seamless.
  const row = [...items, ...items];

  return (
    <Link
      href="/terminal"
      className="ticker-strip group block border-b border-line bg-bg"
      aria-label="Live market ticker — open the terminal"
    >
      <div className="ticker-track py-1.5">
        {row.map((t, i) => {
          const chg = t.q!.metrics?.pct_change ?? null;
          const up = (chg ?? 0) >= 0;
          const color = chg == null ? "#9BACA2" : up ? "#34D399" : "#F4645C";
          return (
            <span key={`${t.sym}-${i}`} className="mx-3 inline-flex items-baseline gap-1.5 font-mono text-[11px] tnum">
              <span className="font-semibold tracking-wide text-mut">{t.label}</span>
              <span className="text-ink">{fmtPrice(t.q!.close as number)}</span>
              <span style={{ color }}>
                {chg == null ? "—" : `${up ? "▲" : "▼"}${Math.abs(chg).toFixed(2)}%`}
              </span>
              <span className="text-line">|</span>
            </span>
          );
        })}
      </div>
    </Link>
  );
}
