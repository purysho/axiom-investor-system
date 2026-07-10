import { describe, expect, it } from "vitest";
import { buildOverview } from "@/lib/engine/overview";
import { baseState, makeTrade, NOW } from "./helpers";

describe("buildOverview", () => {
  it("reports a calm system on a clean state", () => {
    const ov = buildOverview(baseState(), NOW);
    expect(ov).toMatchObject({
      gateState: "RISK ALLOWED",
      gateChecksClear: 6,
      gateChecksTotal: 6,
      openRiskUsd: 0,
      openTrades: 0,
      activeLocks: 0,
      reflectionsDue: 0,
      killSwitch: false,
    });
    expect(ov.heatUsedPct).toBe(0);
    expect(ov.heatCapUsd).toBe(6000); // 6% of $100k
  });

  it("measures open risk against the heat budget", () => {
    const st = baseState();
    st.trades = [
      makeTrade({ status: "Open", exitDate: "", exitPrice: null, entry: 100, stop: 95, shares: 600, exitReason: "" }), // $5 × 600 = $3,000
    ];
    const ov = buildOverview(st, NOW);
    expect(ov.openRiskUsd).toBe(3000);
    expect(ov.openRiskPct).toBeCloseTo(3, 5);
    expect(ov.heatUsedPct).toBeCloseTo(50, 5);
    expect(ov.openTrades).toBe(1);
  });

  it("counts behavioural locks and reflections owed", () => {
    const st = baseState();
    st.trades = [makeTrade({ exitDate: "2026-01-09", lesson: "", ruleFollowed: "" })];
    const ov = buildOverview(st, NOW);
    expect(ov.reflectionsDue).toBe(1);
    expect(ov.activeLocks).toBeGreaterThan(0);
  });

  it("surfaces the kill switch", () => {
    const st = baseState();
    st.copilot.killSwitch = true;
    expect(buildOverview(st, NOW).killSwitch).toBe(true);
  });

  it("degrades safely with a zero portfolio value", () => {
    const st = baseState();
    st.settings.portfolioValue = 0;
    const ov = buildOverview(st, NOW);
    expect(ov.openRiskPct).toBe(0);
    expect(ov.heatUsedPct).toBeNull();
  });
});
