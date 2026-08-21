"use client";

import { useEffect, useState } from "react";
import { Panel, fmtPct } from "@/components/chrome";
import { Sparkline } from "@/components/charts";
import type { BenchmarkReport } from "@/lib/engine/benchmarks";

/**
 * Cross-asset context for the monthly review: the same windows across stocks,
 * gold, crypto, FX, and bonds, so a benchmark gap can be read as "the market
 * moved" vs "my corner of it moved".
 */
export function BenchmarksPanel() {
  const [data, setData] = useState<BenchmarkReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/benchmarks")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setData(j.benchmarks as BenchmarkReport[]))
      .catch(() => setError("Couldn't load cross-asset data right now."));
  }, []);

  const tone = (v: number | null) => (v === null ? undefined : v >= 0 ? "#34D399" : "#F4645C");
  const cell = (v: number | null) => (
    <td className="py-1.5 pr-4 text-right font-mono" style={{ color: tone(v) }}>
      {v === null ? "—" : `${v >= 0 ? "+" : ""}${fmtPct(v)}`}
    </td>
  );

  return (
    <Panel eyebrow="context, not envy" title="Cross-asset picture">
      <p className="mb-3 text-xs leading-relaxed text-mut">
        The same review windows across five asset classes. If everything is up, a positive month says little
        about your process; if everything is down, a small loss might be skill. Delayed end-of-day data.
      </p>
      {error && <p className="text-xs text-faint">{error}</p>}
      {!data && !error && <p className="font-mono text-[11px] text-faint">Loading…</p>}
      {data && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-faint">
                <th className="pb-1.5 pr-4 font-normal">asset</th>
                <th className="pb-1.5 pr-4 font-normal">last ~3 months</th>
                <th className="pb-1.5 pr-4 text-right font-normal">1m</th>
                <th className="pb-1.5 pr-4 text-right font-normal">3m</th>
                <th className="pb-1.5 pr-4 text-right font-normal">6m</th>
                <th className="pb-1.5 pr-4 text-right font-normal">1y</th>
                <th className="pb-1.5 text-right font-normal">YTD</th>
              </tr>
            </thead>
            <tbody className="text-mut">
              {data.map((b) => (
                <tr key={b.id} className="border-t border-line">
                  <td className="py-1.5 pr-4">
                    <span className="text-ink">{b.label}</span>
                    <span className="ml-2 text-[10px] text-faint">{b.assetClass}</span>
                  </td>
                  <td className="w-32 py-1.5 pr-4">
                    {b.spark.length > 1 && (
                      <Sparkline data={b.spark} color={b.spark[b.spark.length - 1] >= 100 ? "#34D399" : "#F4645C"} />
                    )}
                  </td>
                  {cell(b.returns.r1m)}
                  {cell(b.returns.r3m)}
                  {cell(b.returns.r6m)}
                  {cell(b.returns.r1y)}
                  <td className="py-1.5 text-right font-mono" style={{ color: tone(b.returns.ytd) }}>
                    {b.returns.ytd === null ? "—" : `${b.returns.ytd >= 0 ? "+" : ""}${fmtPct(b.returns.ytd)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
