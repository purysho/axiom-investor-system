import { describe, expect, it } from "vitest";
import { computeSizing } from "@/lib/engine/sizing";
import { evaluateGate, openPlannedRiskUsd } from "@/lib/engine/gate";
import { evaluateProtections, lockFor, DEFAULT_PROTECTIONS } from "@/lib/engine/protections";
import { baseState, makeTrade, NOW } from "./helpers";

describe("computeSizing", () => {
  it("sizes from risk, never conviction: floor(risk$ / per-share risk)", () => {
    const s = computeSizing({ portfolioValue: 100_000, riskPerTradePct: 1, entry: 50, stop: 45, target: 60, notionalCapPct: 20 });
    expect(s.riskDollars).toBe(1000);
    expect(s.perShareRisk).toBe(5);
    expect(s.cappedShares).toBe(200);
    expect(s.capApplied).toBe(false);
    expect(s.notional).toBe(10_000);
    expect(s.rewardRisk).toBe(2);
  });

  it("applies the single-name notional cap when a tight stop over-sizes", () => {
    const s = computeSizing({ portfolioValue: 100_000, riskPerTradePct: 1, entry: 100, stop: 99.5, target: null, notionalCapPct: 20 });
    expect(s.maxSharesByRisk).toBe(2000);   // $1000 / $0.50
    expect(s.cappedShares).toBe(200);       // $20k cap / $100
    expect(s.capApplied).toBe(true);
  });

  it("returns nulls rather than dividing by a zero stop distance", () => {
    const s = computeSizing({ portfolioValue: 100_000, riskPerTradePct: 1, entry: 50, stop: 50, target: null, notionalCapPct: 20 });
    expect(s.cappedShares).toBeNull();
  });
});

describe("evaluateGate", () => {
  it("all six checks passing → RISK ALLOWED", () => {
    const st = baseState();
    const g = evaluateGate(st.gateInputs, st.settings, st.trades);
    expect(g.state).toBe("RISK ALLOWED");
    expect(g.fails).toBe(0);
  });

  it("one fail → REDUCED RISK ONLY; two → NO NEW SWINGS", () => {
    const st = baseState();
    st.gateInputs.vix = 30;
    expect(evaluateGate(st.gateInputs, st.settings, st.trades).state).toBe("REDUCED RISK ONLY");
    st.gateInputs.nfci = 1;
    expect(evaluateGate(st.gateInputs, st.settings, st.trades).state).toBe("NO NEW SWINGS");
  });

  it("unknown inputs count as fails — conservative by default", () => {
    const st = baseState();
    st.gateInputs.vix = null;
    const g = evaluateGate(st.gateInputs, st.settings, st.trades);
    expect(g.unknowns).toBe(1);
    expect(g.state).toBe("REDUCED RISK ONLY");
  });

  it("derives open planned risk from the ledger", () => {
    const trades = [
      makeTrade({ status: "Open", exitDate: "", exitPrice: null, entry: 100, stop: 95, shares: 10 }),
      makeTrade({ status: "Open", exitDate: "", exitPrice: null, entry: 40, stop: 38, shares: 50 }),
      makeTrade({ status: "Closed" }), // ignored
    ];
    expect(openPlannedRiskUsd(trades)).toBe(50 + 100);
  });
});

describe("evaluateProtections", () => {
  it("stays silent on a clean history", () => {
    expect(evaluateProtections(baseState(), NOW)).toHaveLength(0);
  });

  it("locks new risk while closed trades lack a reflection", () => {
    const st = baseState();
    st.trades = [makeTrade({ exitDate: "2025-12-01", lesson: "", ruleFollowed: "" })];
    const locks = evaluateProtections(st, NOW);
    expect(locks.some((l) => l.id === "reflections")).toBe(true);
    expect(lockFor(locks)).not.toBeNull();
  });

  it("cools down after a fresh loss", () => {
    const st = baseState();
    st.protections = { ...DEFAULT_PROTECTIONS, requireReflections: false };
    // Loss dated today; closedAt = end of day, so the cooldown is still live at noon.
    st.trades = [makeTrade({ exitDate: "2026-01-10" })];
    const locks = evaluateProtections(st, NOW);
    expect(locks.some((l) => l.id === "cooldown")).toBe(true);
  });

  it("locks everything after N stop-outs in the lookback window", () => {
    const st = baseState();
    st.protections = { ...DEFAULT_PROTECTIONS, requireReflections: false, cooldownMinutes: 0 };
    st.trades = ["2026-01-06", "2026-01-07", "2026-01-08"].map((d) => makeTrade({ exitDate: d, exitReason: "Stop" }));
    const locks = evaluateProtections(st, NOW);
    expect(locks.some((l) => l.id === "stoploss-guard")).toBe(true);
  });

  it("locks a single symbol that keeps losing, without locking others", () => {
    const st = baseState();
    st.protections = {
      ...DEFAULT_PROTECTIONS,
      requireReflections: false,
      cooldownMinutes: 0,
      stoplossGuard: { trades: 99, lookbackDays: 5, lockHours: 24 },   // keep global guards quiet
      maxDrawdown: { pct: 99, lookbackDays: 14, lockHours: 48 },
    };
    st.trades = [
      makeTrade({ ticker: "XYZ", exitDate: "2026-01-05" }),
      makeTrade({ ticker: "XYZ", exitDate: "2026-01-08" }),
    ];
    const locks = evaluateProtections(st, NOW);
    expect(lockFor(locks, "XYZ")?.scope).toBe("symbol");
    expect(lockFor(locks, "ABC")).toBeNull();
  });
});
