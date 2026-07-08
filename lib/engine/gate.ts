import type { GateCheck, GateInputs, GateResult, GateState, Settings, Trade } from "./types";

const fmt = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : n.toFixed(digits);

/** Aggregate planned open swing risk in dollars: Σ |entry − stop| × shares over open trades. */
export function openPlannedRiskUsd(trades: Trade[]): number {
  return trades
    .filter((t) => t.status === "Open")
    .reduce((sum, t) => {
      if (t.entry === null || t.stop === null || t.shares === null) return sum;
      return sum + Math.abs(t.entry - t.stop) * t.shares;
    }, 0);
}

/**
 * Evaluate the six-check Swing Risk Gate.
 * 0 fails → RISK ALLOWED · 1 fail → REDUCED RISK ONLY · ≥2 fails → NO NEW SWINGS.
 * Unknown inputs count as fails (conservative default) and are labeled "awaiting data".
 */
export function evaluateGate(inputs: GateInputs, settings: Settings, trades: Trade[]): GateResult {
  const t = settings.thresholds;
  const openRiskUsd = openPlannedRiskUsd(trades);
  const openRiskPct = settings.portfolioValue > 0 ? (openRiskUsd / settings.portfolioValue) * 100 : 0;

  const checks: GateCheck[] = [];

  // 1 — Benchmark trend
  {
    const known = inputs.benchAbove200dma !== null;
    checks.push({
      id: "trend",
      label: "Benchmark trend",
      current: known ? (inputs.benchAbove200dma ? "Above 200-day MA" : "Below 200-day MA") : "awaiting data",
      threshold: "Close above 200-day MA",
      pass: inputs.benchAbove200dma === true,
      unknown: !known,
      source: inputs.source ?? "Benchmark daily series",
    });
  }
  // 2 — VIX
  {
    const known = inputs.vix !== null;
    checks.push({
      id: "vix",
      label: "VIX",
      current: known ? fmt(inputs.vix) : "awaiting data",
      threshold: `≤ ${t.vixMax}`,
      pass: known && (inputs.vix as number) <= t.vixMax,
      unknown: !known,
      source: "FRED VIXCLS",
    });
  }
  // 3 — NFCI
  {
    const known = inputs.nfci !== null;
    checks.push({
      id: "nfci",
      label: "NFCI",
      current: known ? fmt(inputs.nfci, 3) : "awaiting data",
      threshold: `≤ ${t.nfciMax > 0 ? "+" : ""}${t.nfciMax}`,
      pass: known && (inputs.nfci as number) <= t.nfciMax,
      unknown: !known,
      source: "FRED NFCI",
    });
  }
  // 4 — Personal drawdown (stored as a negative percent; 0 = at highs)
  {
    const known = inputs.drawdownPct !== null;
    checks.push({
      id: "dd",
      label: "Drawdown from high",
      current: known ? `${fmt(inputs.drawdownPct, 1)}%` : "awaiting data",
      threshold: `≥ −${t.maxDrawdownPct}%`,
      pass: known && (inputs.drawdownPct as number) >= -t.maxDrawdownPct,
      unknown: !known,
      source: "Portfolio high-water mark",
    });
  }
  // 5 — Open planned swing risk (derived from the trade ledger)
  checks.push({
    id: "openrisk",
    label: "Open planned swing risk",
    current: `${fmt(openRiskPct, 2)}%  ($${Math.round(openRiskUsd).toLocaleString()})`,
    threshold: `≤ ${t.openRiskBudgetPct}%`,
    pass: openRiskPct <= t.openRiskBudgetPct,
    unknown: false,
    source: "Trade ledger (derived)",
  });
  // 6 — Binary events
  {
    const known = inputs.binaryEventRisk !== null;
    checks.push({
      id: "events",
      label: "Unaccepted binary-event risk",
      current: known ? (inputs.binaryEventRisk ? "Yes" : "No") : "awaiting data",
      threshold: "No",
      pass: inputs.binaryEventRisk === false,
      unknown: !known,
      source: "Issuer filings / event calendar",
    });
  }

  const fails = checks.filter((c) => !c.pass).length;
  const unknowns = checks.filter((c) => c.unknown).length;
  const state: GateState = fails === 0 ? "RISK ALLOWED" : fails === 1 ? "REDUCED RISK ONLY" : "NO NEW SWINGS";
  return { state, checks, fails, unknowns };
}

export function gateColorVar(state: GateState): string {
  // Dark enough to read on the warm cream light-mode background
  return state === "RISK ALLOWED" ? "#34D399" : state === "REDUCED RISK ONLY" ? "#F0B429" : "#F4645C";
}

export function gateBgVar(state: GateState): string {
  return state === "RISK ALLOWED" ? "#10241C" : state === "REDUCED RISK ONLY" ? "#241C0E" : "#241111";
}
