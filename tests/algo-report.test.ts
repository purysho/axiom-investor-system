import { describe, expect, it } from "vitest";
import {
  algorithmSpecMarkdown, buildAlgorithmReportJson, buildAlgorithmReportMarkdown,
  sampleEquityCurve, type AlgoReportInput,
} from "@/lib/engine/algo-report";
import { DEFAULT_BACKTEST_PARAMS, type BacktestResult } from "@/lib/engine/backtest";

function result(overrides: Partial<BacktestResult> = {}): BacktestResult {
  return {
    params: { ...DEFAULT_BACKTEST_PARAMS },
    trades: [
      { symbol: "AAPL", strategy: "Trend pullback", signalDate: "2025-02-03", entryDate: "2025-02-04", entryPrice: 100, qty: 50, stop: 95, target: 110, exitDate: "2025-02-20", exitPrice: 110, exitReason: "target", pl: 500, rMultiple: 2, holdBars: 12 },
      { symbol: "MSFT", strategy: "Mean reversion", signalDate: "2025-03-10", entryDate: "2025-03-11", entryPrice: 200, qty: 20, stop: 190, target: 215, exitDate: "2025-03-18", exitPrice: 190, exitReason: "stop", pl: -200, rMultiple: -1, holdBars: 5 },
    ],
    equityCurve: [
      { date: "2025-01-02", equity: 100_000 },
      { date: "2025-06-02", equity: 100_300 },
      { date: "2025-12-31", equity: 100_300 },
    ],
    metrics: {
      totalReturnPct: 0.3, cagrPct: 0.3, maxDrawdownPct: 0.2, trades: 2, wins: 1, losses: 1,
      winRatePct: 50, expectancyR: 0.5, profitFactor: 2.5, avgHoldBars: 8.5, exposurePct: 12,
      benchmarkReturnPct: 8, startDate: "2025-01-02", endDate: "2025-12-31",
    },
    skipped: { benchmark: 3, heat: 1, concurrency: 0, size: 2, gapThroughStop: 0, cooldown: 0 },
    warnings: [],
    ...overrides,
  };
}

const input = (overrides: Partial<AlgoReportInput> = {}): AlgoReportInput => ({
  symbols: ["AAPL", "MSFT"], missing: [], benchmark: "SPY", years: 1,
  result: result(), generatedAt: "2026-07-13T00:00:00.000Z", ...overrides,
});

describe("algorithmSpecMarkdown", () => {
  it("states the exact entry-rule numbers from strategy.ts", () => {
    const spec = algorithmSpecMarkdown();
    // Trend pullback thresholds
    expect(spec).toContain("38 ≤ RSI14 ≤ 55");
    expect(spec).toContain("2 × ATR14");
    expect(spec).toContain("2 × (entry − stop)");
    // Mean reversion thresholds
    expect(spec).toContain("RSI14 < 32");
    expect(spec).toContain("2.5 × ATR14");
    expect(spec).toContain("1.5 × (entry − stop)");
    // Long-only invariant is stated
    expect(spec.toLowerCase()).toContain("long-only");
  });
});

describe("buildAlgorithmReportMarkdown", () => {
  it("is self-contained: reviewer framing, spec, config, results, caveats", () => {
    const md = buildAlgorithmReportMarkdown(input());
    expect(md).toContain("For the reviewer");
    expect(md).toContain("The algorithm (exact rules)");
    expect(md).toContain("Backtest configuration");
    expect(md).toContain("## Results");
    expect(md).toContain("Honesty caveats");
    // Real numbers surface
    expect(md).toContain("0.3%");           // total return
    expect(md).toContain("SPY");            // benchmark
    expect(md).toContain("AAPL");           // a traded symbol
    // It asks the reviewer to be skeptical, not to cheer
    expect(md.toLowerCase()).toContain("overfit");
  });

  it("handles a zero-trade window without pretending trades exist", () => {
    const md = buildAlgorithmReportMarkdown(input({
      result: result({ trades: [], metrics: { ...result().metrics, trades: 0, wins: 0, losses: 0, winRatePct: null, expectancyR: null, profitFactor: null } }),
    }));
    expect(md).toContain("No trades were taken");
    expect(md).not.toContain("| AAPL |");
  });

  it("reports the benchmark-relative return", () => {
    const md = buildAlgorithmReportMarkdown(input());
    // 0.3% strategy − 8% benchmark = −7.7 percentage points
    expect(md).toContain("−7.7%");
    expect(md).toContain("buy-and-hold");
  });
});

describe("buildAlgorithmReportJson", () => {
  it("is valid JSON tagged as an axiom report with a disclaimer", () => {
    const parsed = JSON.parse(buildAlgorithmReportJson(input()));
    expect(parsed.kind).toBe("axiom-algorithm-report");
    expect(parsed.disclaimer).toMatch(/not investment advice/i);
    expect(parsed.metrics.totalReturnPct).toBe(0.3);
    expect(parsed.params.slippageBps).toBe(5);
    expect(Array.isArray(parsed.trades)).toBe(true);
  });
});

describe("sampleEquityCurve", () => {
  it("returns the curve unchanged when it is already short", () => {
    const c = [{ date: "a", equity: 1 }, { date: "b", equity: 2 }];
    expect(sampleEquityCurve(c, 24)).toEqual(c);
  });

  it("downsamples a long curve while keeping the first and last points", () => {
    const c = Array.from({ length: 500 }, (_, i) => ({ date: `d${i}`, equity: 100 + i }));
    const s = sampleEquityCurve(c, 24);
    expect(s.length).toBeLessThanOrEqual(25);
    expect(s[0]).toEqual(c[0]);
    expect(s[s.length - 1]).toEqual(c[c.length - 1]);
  });
});
