import { describe, expect, it } from "vitest";
import { runBacktest } from "@/lib/engine/backtest";
import { computeIndicators, signalAt, FIRST_TRADABLE_BAR } from "@/lib/engine/strategy";
import type { DailyRow } from "@/lib/engine/quotes";
import { syntheticSeries } from "./helpers";

describe("runBacktest", () => {
  const rows = syntheticSeries(1500);
  const result = runBacktest({ TEST: rows }, { benchmarkFilter: false, slippageBps: 5 });

  it("produces a meaningful sample on a trending series", () => {
    expect(result.metrics.trades).toBeGreaterThan(3);
    expect(result.equityCurve.length).toBeGreaterThan(1000);
  });

  it("keeps the ledger balanced: final equity = start + ΣP&L", () => {
    const sumPl = result.trades.reduce((a, t) => a + t.pl, 0);
    const finalEq = result.equityCurve[result.equityCurve.length - 1].equity;
    expect(Math.abs(finalEq - (100_000 + sumPl))).toBeLessThan(1);
  });

  it("never looks ahead: every fill is strictly after its signal bar", () => {
    expect(result.trades.every((t) => t.entryDate > t.signalDate)).toBe(true);
  });

  it("attaches a protective stop below entry on every trade", () => {
    expect(result.trades.every((t) => t.stop < t.entryPrice)).toBe(true);
  });

  it("respects indicator warm-up before the first fill", () => {
    expect(result.trades.every((t) => t.entryDate >= rows[FIRST_TRADABLE_BAR].date)).toBe(true);
  });

  it("resolves a bar that touches both stop and target as a STOP", () => {
    // Find any real signal, then craft the next bar to span both levels.
    const ind = computeIndicators(rows);
    let sigIdx = -1;
    for (let i = FIRST_TRADABLE_BAR; i < rows.length - 2; i++) {
      if (signalAt("TEST", rows, ind, i)) { sigIdx = i; break; }
    }
    expect(sigIdx).toBeGreaterThan(0);
    const sig = signalAt("TEST", rows, ind, sigIdx)!;
    const crafted: DailyRow[] = [...rows.slice(0, sigIdx + 2)];
    crafted[sigIdx + 1] = {
      ...crafted[sigIdx + 1],
      open: sig.entry,
      high: sig.takeProfit * 1.05,
      low: sig.stop * 0.95,
      close: sig.entry,
    };
    const r = runBacktest({ TEST: crafted }, { benchmarkFilter: false, slippageBps: 0 });
    const t = r.trades.find((x) => x.entryDate === crafted[sigIdx + 1].date);
    expect(t?.exitReason).toBe("stop");
  });

  it("skips symbols without enough history, with a warning", () => {
    const short = syntheticSeries(50, 7);
    const r = runBacktest({ SHORT: short }, { benchmarkFilter: false });
    expect(r.trades).toHaveLength(0);
    expect(r.warnings.join(" ")).toMatch(/warm-up/i);
  });

  it("disables the benchmark filter with a warning when no benchmark rows are supplied", () => {
    const r = runBacktest({ TEST: rows.slice(0, 400) }, { benchmarkFilter: true }, null);
    expect(r.warnings.join(" ")).toMatch(/benchmark/i);
  });

  it("charges slippage: zero-slippage run never does worse", () => {
    const withSlip = runBacktest({ TEST: rows }, { benchmarkFilter: false, slippageBps: 25 });
    const noSlip = runBacktest({ TEST: rows }, { benchmarkFilter: false, slippageBps: 0 });
    expect(noSlip.metrics.totalReturnPct).toBeGreaterThanOrEqual(withSlip.metrics.totalReturnPct);
  });
});
