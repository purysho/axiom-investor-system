import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBacktest, DEFAULT_BACKTEST_PARAMS } from "@/lib/engine/backtest";
import { buildReproPython } from "@/lib/engine/algo-repro";
import { syntheticSeries } from "./helpers";

/**
 * Guards the "reproduce what you backtest" invariant: the exported Python must
 * match the canonical TS engine trade-for-trade. Runs only where python3 is
 * available (CI + most dev machines); skips gracefully otherwise so `npm test`
 * never depends on a Python install.
 */
function pythonBin(): string | null {
  for (const bin of ["python3", "python"]) {
    try { execFileSync(bin, ["--version"], { stdio: "ignore" }); return bin; } catch { /* next */ }
  }
  return null;
}

describe("Python reproduction port", () => {
  const py = pythonBin();

  it.runIf(py)("reproduces the TS backtest trade-for-trade", () => {
    const series = {
      AAPL: syntheticSeries(600, 7, 180),
      MSFT: syntheticSeries(600, 21, 320),
      NVDA: syntheticSeries(600, 33, 90),
    };
    const bench = syntheticSeries(600, 99, 500);
    const params = { ...DEFAULT_BACKTEST_PARAMS, perSymbolCooldownBars: 5, requireEntryConfirmation: true };
    const result = runBacktest(series, params, bench);

    const source = buildReproPython({
      symbols: ["AAPL", "MSFT", "NVDA"], benchmark: "SPY", params,
      series, benchmarkRows: bench, dataSource: "synthetic", generatedAt: "test",
    });
    const dir = mkdtempSync(join(tmpdir(), "axiom-repro-"));
    const file = join(dir, "repro.py");
    writeFileSync(file, source);

    const out = execFileSync(py as string, [file, "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const got = JSON.parse(out) as {
      metrics: Record<string, unknown>;
      skipped: Record<string, number>;
      trades: Array<{ symbol: string; entryDate: string; exitDate: string; exitReason: string; rMultiple: number; pl: number }>;
    };

    // Metrics + refused-entry counts match.
    expect(got.metrics.totalReturnPct).toBe(result.metrics.totalReturnPct);
    expect(got.metrics.trades).toBe(result.metrics.trades);
    expect(got.metrics.expectancyR).toBe(result.metrics.expectancyR);
    expect(got.metrics.maxDrawdownPct).toBe(result.metrics.maxDrawdownPct);
    expect(got.metrics.benchmarkReturnPct).toBe(result.metrics.benchmarkReturnPct);
    expect(got.skipped).toEqual(result.skipped);

    // Every trade matches exactly.
    expect(got.trades.length).toBe(result.trades.length);
    result.trades.forEach((t, i) => {
      const g = got.trades[i];
      expect(g.symbol).toBe(t.symbol);
      expect(g.entryDate).toBe(t.entryDate);
      expect(g.exitDate).toBe(t.exitDate);
      expect(g.exitReason).toBe(t.exitReason);
      expect(g.rMultiple).toBeCloseTo(t.rMultiple, 9);
      expect(g.pl).toBeCloseTo(t.pl, 9);
    });
  });
});
