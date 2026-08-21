import { describe, expect, it } from "vitest";
import { DEFAULT_PROTECTIONS, evaluateProtections } from "@/lib/engine/protections";
import { baseState, makeTrade, NOW } from "./helpers";

/** Roadmap safety control: realised losses today beyond the limit → done for the day. */
describe("daily loss limit", () => {
  function stateWithTodayLoss(lossUsd: number) {
    const st = baseState(); // $100k portfolio → default 2% limit = $2,000
    st.protections = { ...DEFAULT_PROTECTIONS, requireReflections: false, cooldownMinutes: 0, revengeWindowMinutes: 0, maxDrawdown: { pct: 99, lookbackDays: 14, lockHours: 48 }, stoplossGuard: { trades: 99, lookbackDays: 5, lockHours: 24 } };
    // One closed trade today with the requested loss: shares × (exit − entry).
    st.trades = [makeTrade({ exitDate: "2026-01-10", exitReason: "Stop", entry: 100, stop: 90, exitPrice: 100 - lossUsd / 100, shares: 100 })];
    return st;
  }

  it("locks everything for the rest of the day past the limit", () => {
    const locks = evaluateProtections(stateWithTodayLoss(2500), NOW);
    const lock = locks.find((l) => l.id === "daily-loss");
    expect(lock).toBeDefined();
    expect(lock!.scope).toBe("global");
    expect(lock!.until).toBe("2026-01-11T00:00:00.000Z"); // next UTC midnight
    expect(lock!.reason).toMatch(/2\.5% today/);
  });

  it("stays quiet under the limit", () => {
    const locks = evaluateProtections(stateWithTodayLoss(1500), NOW);
    expect(locks.find((l) => l.id === "daily-loss")).toBeUndefined();
  });

  it("ignores losses from previous days", () => {
    const st = stateWithTodayLoss(2500);
    st.trades[0] = { ...st.trades[0], exitDate: "2026-01-09" };
    const locks = evaluateProtections(st, NOW);
    expect(locks.find((l) => l.id === "daily-loss")).toBeUndefined();
  });

  it("applies the default limit to states saved before the rule existed", () => {
    const st = stateWithTodayLoss(2500);
    delete st.protections.dailyLoss; // legacy stored state
    const locks = evaluateProtections(st, NOW);
    expect(locks.find((l) => l.id === "daily-loss")).toBeDefined();
  });

  it("respects the master protections switch", () => {
    const st = stateWithTodayLoss(2500);
    st.protections.enabled = false;
    expect(evaluateProtections(st, NOW)).toHaveLength(0);
  });
});
