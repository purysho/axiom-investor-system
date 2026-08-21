import { evaluateGate, openPlannedRiskUsd } from "./gate";
import { evaluateProtections } from "./protections";
import type { AppState, GateState } from "./types";

/**
 * The system-status model behind the Today dashboard strip: what a
 * professional terminal would show, reduced to the numbers AXIOM actually
 * runs on. Pure — client state in, display model out — so the strip and its
 * tests agree by construction.
 */
export interface Overview {
  gateState: GateState;
  gateChecksClear: number;
  gateChecksTotal: number;
  /** Σ |entry − stop| × shares over open trades. */
  openRiskUsd: number;
  openRiskPct: number;
  heatCapUsd: number;
  /** Open planned risk as a share of the heat budget, 0–100+ (can exceed 100). */
  heatUsedPct: number | null;
  openTrades: number;
  /** Behavioural locks currently standing (global + symbol). */
  activeLocks: number;
  /** Closed trades still owed a reflection — they block new risk. */
  reflectionsDue: number;
  killSwitch: boolean;
}

export function buildOverview(state: AppState, now = Date.now()): Overview {
  const gate = evaluateGate(state.gateInputs, state.settings, state.trades);
  const locks = evaluateProtections(state, now);
  const openRiskUsd = openPlannedRiskUsd(state.trades);
  const heatCapUsd = (state.settings.heatCapPct / 100) * state.settings.portfolioValue;
  return {
    gateState: gate.state,
    gateChecksClear: gate.checks.filter((c) => c.pass).length,
    gateChecksTotal: gate.checks.length,
    openRiskUsd,
    openRiskPct: state.settings.portfolioValue > 0 ? (openRiskUsd / state.settings.portfolioValue) * 100 : 0,
    heatCapUsd,
    heatUsedPct: heatCapUsd > 0 ? (openRiskUsd / heatCapUsd) * 100 : null,
    openTrades: state.trades.filter((t) => t.status === "Open").length,
    activeLocks: locks.length,
    reflectionsDue: state.trades.filter((t) => t.status === "Closed" && (!t.lesson?.trim() || !t.ruleFollowed)).length,
    killSwitch: state.copilot.killSwitch,
  };
}
