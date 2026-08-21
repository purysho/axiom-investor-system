import { describe, expect, it } from "vitest";
import { BENCHMARK_SET, buildBenchmarkReport, rebasedTail, returnsOverWindows } from "@/lib/engine/benchmarks";
import type { DailyRow } from "@/lib/engine/quotes";

/** Daily bars from `start`, one per calendar day, close = f(dayIndex). */
function series(start: string, days: number, closeAt: (i: number) => number): DailyRow[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => {
    const c = closeAt(i);
    return { date: new Date(t0 + i * 86_400_000).toISOString().slice(0, 10), open: c, high: c, low: c, close: c, volume: null };
  });
}

const NOW = Date.parse("2026-01-10T12:00:00Z");

describe("returnsOverWindows", () => {
  it("measures each window from the last bar back to the bar at/before the cutoff", () => {
    // 400 days ending 2026-01-09, close = 100 + i → strictly linear.
    const rows = series("2024-12-06", 400, (i) => 100 + i);
    const r = returnsOverWindows(rows, NOW);
    const last = 100 + 399;
    // 30 calendar days before 2026-01-10 → 2025-12-11, which is bar i=370.
    expect(r.r1m).toBeCloseTo(((last / 470) - 1) * 100, 1);
    expect(r.r1y).not.toBeNull();
    expect(r.r1y!).toBeGreaterThan(r.r3m!);
    // YTD cutoff 2026-01-01 → i=391.
    expect(r.ytd).toBeCloseTo(((last / 491) - 1) * 100, 1);
  });

  it("returns nulls when the history doesn't reach the window", () => {
    const rows = series("2026-01-01", 9, (i) => 100 + i);
    const r = returnsOverWindows(rows, NOW);
    expect(r.r1m).toBeNull();
    expect(r.r1y).toBeNull();
    expect(r.ytd).not.toBeNull(); // year started inside the series
  });

  it("handles an empty series", () => {
    expect(returnsOverWindows([], NOW)).toEqual({ r1m: null, r3m: null, r6m: null, r1y: null, ytd: null });
  });
});

describe("rebasedTail", () => {
  it("rebases the tail to 100 at the window start", () => {
    const rows = series("2025-01-01", 100, (i) => 50 * (1 + i / 100));
    const spark = rebasedTail(rows, 60);
    expect(spark).toHaveLength(60);
    expect(spark[0]).toBe(100);
    expect(spark[spark.length - 1]).toBeGreaterThan(100);
  });

  it("returns empty for degenerate input", () => {
    expect(rebasedTail([], 60)).toEqual([]);
    expect(rebasedTail(series("2025-01-01", 1, () => 100), 60)).toEqual([]);
  });
});

describe("buildBenchmarkReport", () => {
  it("carries the definition through and stamps the data date", () => {
    const rows = series("2025-01-01", 300, (i) => 100 + i);
    const rep = buildBenchmarkReport(BENCHMARK_SET[0], rows, NOW);
    expect(rep.id).toBe("spx");
    expect(rep.asOf).toBe(rows[rows.length - 1].date);
    expect(rep.lastClose).toBe(399);
    expect(rep.spark.length).toBeGreaterThan(0);
  });

  it("degrades to an all-null report when a feed is missing", () => {
    const rep = buildBenchmarkReport(BENCHMARK_SET[1], null, NOW);
    expect(rep.asOf).toBeNull();
    expect(rep.returns.r1y).toBeNull();
    expect(rep.spark).toEqual([]);
  });

  it("covers the roadmap's five asset classes", () => {
    expect(new Set(BENCHMARK_SET.map((b) => b.assetClass))).toEqual(new Set(["Equity", "Metal", "Crypto", "FX", "Bond"]));
  });
});
