import { describe, expect, it } from "vitest";
import { flowAdjustedReturnPct, journalStats, portfolioStats, rMultiple } from "@/lib/engine/stats";
import type { Holding } from "@/lib/engine/types";
import { makeTrade } from "./helpers";

function holding(overrides: Partial<Holding>): Holding {
  return {
    id: `H-${Math.random().toString(36).slice(2, 8)}`,
    ticker: "TEST", type: "ETF", sleeve: "Core",
    shares: null, costBasis: null, price: null, targetWeightPct: null,
    expenseRatioPct: null, yieldPct: null, payoutRatioPct: null, annualDistPerShare: null,
    benchmark: "", thesisStatus: "", payoutGrade: "", coverageNote: "", action: "", notes: "",
    ...overrides,
  };
}

describe("portfolioStats — analytics", () => {
  const holdings = [
    holding({ ticker: "VTI", sleeve: "Core", shares: 100, price: 300, costBasis: 250, targetWeightPct: 60 }),
    holding({ ticker: "SCHD", sleeve: "Income", shares: 200, price: 80, costBasis: 90, yieldPct: 3.5 }),
    holding({ ticker: "NVDA", sleeve: "Satellite", shares: 20, price: 200, costBasis: 100 }),
    holding({ ticker: "CASH", sleeve: "Cash", shares: 1, price: 10_000 }),
    holding({ ticker: "NOPRICE" }), // unpriced — excluded from weights
  ];
  const ps = portfolioStats(holdings);
  // MVs: 30k + 16k + 4k + 10k = 60k

  it("aggregates by sleeve with weights that sum to ~100%", () => {
    expect(ps.sleeves.map((s) => s.sleeve)).toEqual(["Core", "Income", "Cash", "Satellite"]);
    expect(ps.sleeves[0]).toMatchObject({ sleeve: "Core", marketValue: 30_000, holdings: 1 });
    expect(ps.sleeves[0].weightPct).toBeCloseTo(50, 5);
    expect(ps.sleeves.reduce((a, s) => a + s.weightPct, 0)).toBeCloseTo(100, 5);
  });

  it("sums unrealized P&L over holdings with a cost basis", () => {
    // +5000 (VTI) − 2000 (SCHD) + 2000 (NVDA); CASH has no basis
    expect(ps.totalUnrealizedUsd).toBe(5000);
  });

  it("computes HHI and the effective number of positions", () => {
    // weights .5, .266, .066, .166 → HHI = .25+.0711+.0044+.0278 ≈ .3533
    expect(ps.hhi).toBeCloseTo(0.3533, 3);
    expect(ps.effectiveHoldings).toBeCloseTo(1 / 0.3533, 2);
  });

  it("keeps the original numbers intact", () => {
    expect(ps.totalMarketValue).toBe(60_000);
    expect(ps.topWeightTicker).toBe("VTI");
    expect(ps.unpricedTickers).toEqual(["NOPRICE"]);
    const vti = ps.rows.find((r) => r.ticker === "VTI")!;
    expect(vti.driftPct).toBeCloseTo(-10, 5); // 50% actual vs 60% target
  });

  it("handles an empty portfolio without dividing by zero", () => {
    const empty = portfolioStats([]);
    expect(empty.totalMarketValue).toBe(0);
    expect(empty.hhi).toBeNull();
    expect(empty.totalUnrealizedUsd).toBeNull();
    expect(empty.sleeves).toEqual([]);
  });
});

describe("journalStats — journal analytics", () => {
  const trades = [
    makeTrade({ entry: 100, stop: 95, exitPrice: 110, shares: 10, exitReason: "Target", ruleFollowed: "Yes" }),  // +2R
    makeTrade({ entry: 100, stop: 95, exitPrice: 95, shares: 10, exitReason: "Stop", ruleFollowed: "Yes" }),     // −1R
    makeTrade({ entry: 50, stop: 48, exitPrice: 53, shares: 20, exitReason: "Target", ruleFollowed: "No" }),     // +1.5R
    makeTrade({ status: "Open", exitDate: "", exitPrice: null }), // ignored
  ];
  const js = journalStats(trades);

  it("computes R multiples, win rate, and expectancy from closed trades", () => {
    expect(rMultiple(trades[0])).toBeCloseTo(2, 5);
    expect(js.closedCount).toBe(3);
    expect(js.winRatePct).toBeCloseTo((2 / 3) * 100, 5);
    // E = (2/3)(1.75) + (1/3)(−1) = 0.8333
    expect(js.expectancyR).toBeCloseTo(0.8333, 3);
  });

  it("tracks rule adherence", () => {
    expect(js.adherencePct).toBeCloseTo((2 / 3) * 100, 5);
  });
});

describe("flowAdjustedReturnPct", () => {
  it("adjusts for contributions with the half-flow convention", () => {
    // start 100k, +10k contributions, end 115k → gain 5k over 105k
    expect(flowAdjustedReturnPct(100_000, 10_000, 115_000)).toBeCloseTo(4.7619, 3);
    expect(flowAdjustedReturnPct(null, 0, 100)).toBeNull();
  });
});
