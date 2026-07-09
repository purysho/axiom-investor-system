import { describe, expect, it } from "vitest";
import { validateRecommendation, VALIDATOR_LIMITS } from "@/lib/copilot/validate";
import type { Recommendation } from "@/lib/copilot/types";
import { baseRec, baseState, makeTrade, NOW } from "./helpers";

/**
 * The deterministic gatekeeper. Every proposal — AI or rules — passes through
 * validateRecommendation before it can be approved, sized, or executed.
 * These tests pin down every rejection path the spec demands.
 */
describe("validateRecommendation", () => {
  it("accepts a sound proposal and sizes it with OUR risk engine", () => {
    const out = validateRecommendation(baseRec(), baseState(), NOW);
    expect(out.validation.ok).toBe(true);
    // $100k × 0.5% = $500 risk; $4/share risk → 125 shares
    expect(out.positionSize).toBe(125);
    expect(out.maxRiskUsd).toBe(500);
    expect(out.status).toBe("proposed");
  });

  it("rejects an expired proposal", () => {
    const out = validateRecommendation(baseRec({ expiry: new Date(NOW - 1000).toISOString() }), baseState(), NOW);
    expect(out.validation.ok).toBe(false);
    expect(out.status).toBe("rejected");
    expect(out.validation.notes.join(" ")).toMatch(/expired/i);
  });

  it("rejects a proposal without evidence", () => {
    const out = validateRecommendation(baseRec({ evidence: ["  "] }), baseState(), NOW);
    expect(out.validation.ok).toBe(false);
    expect(out.validation.notes.join(" ")).toMatch(/evidence/i);
  });

  it("rejects overconfidence and noise-level confidence alike", () => {
    for (const confidence of [0.99, 0.01, Number.NaN]) {
      const out = validateRecommendation(baseRec({ confidence }), baseState(), NOW);
      expect(out.validation.ok).toBe(false);
      expect(out.validation.notes.join(" ")).toMatch(/confidence/i);
    }
    // Boundary values are allowed.
    const edge = validateRecommendation(baseRec({ confidence: VALIDATOR_LIMITS.maxConfidence }), baseState(), NOW);
    expect(edge.validation.ok).toBe(true);
  });

  it("rejects a proposal that smuggles an execution instruction", () => {
    const sneaky = { ...baseRec(), execute: true } as unknown as Recommendation;
    const out = validateRecommendation(sneaky, baseState(), NOW);
    expect(out.validation.ok).toBe(false);
    expect(out.validation.notes.join(" ")).toMatch(/execution/i);
  });

  it("rejects stale data", () => {
    const out = validateRecommendation(
      baseRec({ dataAsOf: new Date(NOW - (VALIDATOR_LIMITS.maxDataAgeDays + 2) * 86_400_000).toISOString().slice(0, 10) }),
      baseState(),
      NOW,
    );
    expect(out.validation.ok).toBe(false);
    expect(out.validation.notes.join(" ")).toMatch(/older than/i);
  });

  it("rejects asset classes outside the execution path", () => {
    const out = validateRecommendation(baseRec({ market: "Crypto", asset: "BTCUSD" }), baseState(), NOW);
    expect(out.validation.ok).toBe(false);
    expect(out.validation.notes.join(" ")).toMatch(/chart-only/i);
  });

  it("rejects reward:risk below the floor", () => {
    // Stop $4 below entry; target only $2 above → 0.5R
    const out = validateRecommendation(baseRec({ takeProfits: [102] }), baseState(), NOW);
    expect(out.validation.ok).toBe(false);
    expect(out.validation.notes.join(" ")).toMatch(/reward:risk/i);
  });

  it("rejects a long whose stop sits above the entry", () => {
    const out = validateRecommendation(baseRec({ stop: 104, takeProfits: [120] }), baseState(), NOW);
    expect(out.validation.ok).toBe(false);
  });

  it("blocks all new risk when the gate says NO NEW SWINGS", () => {
    const state = baseState();
    state.gateInputs.vix = 40;   // fail 1
    state.gateInputs.nfci = 2;   // fail 2 → NO NEW SWINGS
    const out = validateRecommendation(baseRec(), state, NOW);
    expect(out.validation.ok).toBe(false);
    expect(out.validation.notes.join(" ")).toMatch(/NO NEW SWINGS/);
  });

  it("halves size under REDUCED RISK ONLY", () => {
    const state = baseState();
    state.gateInputs.vix = 30; // exactly one fail
    const out = validateRecommendation(baseRec(), state, NOW);
    expect(out.validation.ok).toBe(true);
    expect(out.positionSize).toBe(62); // floor(250 / 4)
    expect(out.validation.notes.join(" ")).toMatch(/REDUCED RISK ONLY/);
  });

  it("obeys the kill switch", () => {
    const state = baseState();
    state.copilot.killSwitch = true;
    const out = validateRecommendation(baseRec(), state, NOW);
    expect(out.validation.ok).toBe(false);
    expect(out.validation.notes.join(" ")).toMatch(/kill switch/i);
  });

  it("enforces the heat cap against already-open planned risk", () => {
    const state = baseState();
    // Open trade already risking $5,800 of the $6,000 (6%) heat budget.
    state.trades = [makeTrade({ status: "Open", exitDate: "", exitPrice: null, entry: 100, stop: 42, shares: 100, exitReason: "" })];
    const out = validateRecommendation(baseRec(), state, NOW);
    expect(out.validation.ok).toBe(false);
    expect(out.validation.notes.join(" ")).toMatch(/heat cap/i);
  });

  it("enforces the copilot concurrency cap", () => {
    const state = baseState();
    state.trades = [0, 1, 2].map(() =>
      makeTrade({ status: "Open", exitDate: "", exitPrice: null, entry: 100, stop: 99.5, shares: 1, tags: "copilot;paper", exitReason: "" }),
    );
    const out = validateRecommendation(baseRec(), state, NOW);
    expect(out.validation.ok).toBe(false);
    expect(out.validation.notes.join(" ")).toMatch(/copilot positions open/i);
  });

  it("passes informational recs (no order attached) through structural checks only", () => {
    const rec = baseRec({ strategy: "Exit review", entry: null, stop: null, takeProfits: [] });
    const out = validateRecommendation(rec, baseState(), NOW);
    expect(out.validation.ok).toBe(true);
    expect(out.validation.notes.join(" ")).toMatch(/informational/i);
    // …but not past them: an expired exit review is still dead.
    const expired = validateRecommendation({ ...rec, expiry: new Date(NOW - 1).toISOString() }, baseState(), NOW);
    expect(expired.validation.ok).toBe(false);
  });
});
