import { describe, expect, it } from "vitest";
import { computeIndicators, latestSignal, signalAt, FIRST_TRADABLE_BAR } from "@/lib/engine/strategy";
import { rsi, sma, type DailyRow } from "@/lib/engine/quotes";
import { prng, syntheticSeries } from "./helpers";

function rowsFromCloses(closes: number[]): DailyRow[] {
  return closes.map((c, i) => ({
    date: new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
    open: c, high: c * 1.005, low: c * 0.995, close: c, volume: 1e6,
  }));
}

describe("computeIndicators", () => {
  const rand = prng(7);
  const closes: number[] = [];
  let p = 100;
  for (let i = 0; i < 80; i++) { p *= 1 + (rand() - 0.5) * 0.03; closes.push(p); }
  const rows = rowsFromCloses(closes);
  const ind = computeIndicators(rows);

  it("O(n) RSI series matches the reference prefix implementation", () => {
    for (const i of [14, 20, 40, 79]) {
      const reference = rsi(closes.slice(0, i + 1), 14);
      expect(ind.rsi14[i]).not.toBeNull();
      expect(Math.abs((ind.rsi14[i] as number) - (reference as number))).toBeLessThan(1e-9);
    }
    expect(ind.rsi14[13]).toBeNull(); // needs period+1 closes
  });

  it("rolling SMA matches the reference implementation", () => {
    const reference = sma(closes, 20);
    for (const i of [18, 19, 50, 79]) {
      if (reference[i] === null) expect(ind.sma20[i]).toBeNull();
      else expect(Math.abs((ind.sma20[i] as number) - (reference[i] as number))).toBeLessThan(1e-9);
    }
  });
});

describe("signalAt", () => {
  const rows = syntheticSeries(1500);
  const ind = computeIndicators(rows);

  it("emits well-formed signals with stop, target, invalidation, and data date", () => {
    let found = 0;
    for (let i = FIRST_TRADABLE_BAR; i < rows.length; i++) {
      const s = signalAt("TEST", rows, ind, i);
      if (!s) continue;
      found++;
      expect(s.stop).toBeGreaterThan(0);
      expect(s.stop).toBeLessThan(s.entry);
      expect(s.takeProfit).toBeGreaterThan(s.entry);
      const rr = (s.takeProfit - s.entry) / (s.entry - s.stop);
      expect(rr).toBeGreaterThanOrEqual(1.45); // 1.5R (mean reversion) or 2R (trend), pre-rounding
      expect(s.evidence.length).toBeGreaterThanOrEqual(2);
      expect(s.invalidation).toMatch(/\S/);
      expect(s.dataAsOf).toBe(rows[i].date);
    }
    expect(found).toBeGreaterThan(0);
  });

  it("stays silent when the long-term trend is broken (price below 200-day SMA)", () => {
    // Monotonic decline: price is always below its long-run average.
    const closes = Array.from({ length: 400 }, (_, i) => 400 - i * 0.8);
    const down = rowsFromCloses(closes);
    const dInd = computeIndicators(down);
    for (let i = 260; i < down.length; i++) {
      expect(signalAt("DOWN", down, dInd, i)).toBeNull();
    }
  });

  it("latestSignal needs at least 30 bars", () => {
    expect(latestSignal("X", rows.slice(0, 20))).toBeNull();
  });

  it("entry confirmation only filters — never invents — signals, and blocks bearish signal bars", () => {
    let baseline = 0;
    let confirmed = 0;
    let everBlockedBearish = false;
    for (let i = FIRST_TRADABLE_BAR; i < rows.length; i++) {
      const base = signalAt("T", rows, ind, i);
      const conf = signalAt("T", rows, ind, i, undefined, { confirm: true });
      if (base) baseline++;
      if (conf) {
        confirmed++;
        // A confirmed signal must be on a bullish bar (close > open).
        expect(rows[i].close).toBeGreaterThan(rows[i].open);
      }
      // Confirmation can only ever be a subset of the baseline signals.
      if (conf) expect(base).not.toBeNull();
      if (base && !conf) everBlockedBearish = true;
    }
    expect(baseline).toBeGreaterThan(0);
    expect(confirmed).toBeLessThanOrEqual(baseline);
    expect(everBlockedBearish).toBe(true); // at least one bearish signal bar was filtered out
  });
});
