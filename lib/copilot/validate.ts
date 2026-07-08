import { evaluateGate, openPlannedRiskUsd } from "@/lib/engine/gate";
import { computeSizing } from "@/lib/engine/sizing";
import type { AppState } from "@/lib/engine/types";
import type { Recommendation } from "./types";

/**
 * The deterministic gatekeeper (spec: "Execution Validator"). Every recommendation —
 * AI or rules — passes through here with the user's LIVE state before it can be shown
 * as approvable. It recomputes size from OUR risk engine (the model's numbers are
 * advisory), enforces the six-check gate as a hard interlock for new risk, and applies
 * the caps. It mutates nothing; it returns the validated copy.
 */
export function validateRecommendation(rec: Recommendation, state: AppState): Recommendation {
  const notes: string[] = [];
  const gate = evaluateGate(state.gateInputs, state.settings, state.trades);
  const out: Recommendation = { ...rec, macro: { ...rec.macro, gateState: gate.state } };

  const isNewRisk = rec.strategy !== "Exit review" && rec.entry !== null;

  // 1) Gate interlock — the whole point of Axiom
  if (isNewRisk && gate.state === "NO NEW SWINGS") {
    notes.push("Blocked: the risk check says NO NEW SWINGS. Copilot cannot open new risk today.");
    out.validation = { ok: false, notes };
    out.status = "rejected";
    out.positionSize = null;
    out.maxRiskUsd = null;
    return out;
  }
  if (isNewRisk && gate.state === "REDUCED RISK ONLY") {
    notes.push("Gate is REDUCED RISK ONLY — size halved; approving records a documented exception.");
  }

  // 2) Kill switch
  if (state.copilot.killSwitch) {
    notes.push("Blocked: the kill switch is on.");
    out.validation = { ok: false, notes };
    out.status = "rejected";
    return out;
  }

  if (!isNewRisk) {
    out.validation = { ok: true, notes: ["Informational — no order attached."] };
    return out;
  }

  // 3) Sanity on the model's levels
  if (rec.entry === null || rec.stop === null || !(rec.entry > 0) || !(rec.stop > 0)) {
    out.validation = { ok: false, notes: ["Rejected: missing or invalid entry/stop."] };
    out.status = "rejected";
    return out;
  }
  if (rec.side === "Long" && rec.stop >= rec.entry) {
    out.validation = { ok: false, notes: ["Rejected: long with stop above entry."] };
    out.status = "rejected";
    return out;
  }
  const stopDistPct = (Math.abs(rec.entry - rec.stop) / rec.entry) * 100;
  if (stopDistPct < 0.5 || stopDistPct > 25) {
    out.validation = { ok: false, notes: [`Rejected: stop distance ${stopDistPct.toFixed(1)}% is outside sane bounds (0.5–25%).`] };
    out.status = "rejected";
    return out;
  }

  // 4) OUR sizing, not the model's
  const riskPct = gate.state === "REDUCED RISK ONLY" ? state.settings.riskPerTradePct / 2 : state.settings.riskPerTradePct;
  const sized = computeSizing({
    portfolioValue: state.settings.portfolioValue,
    riskPerTradePct: riskPct,
    entry: rec.entry,
    stop: rec.stop,
    target: rec.takeProfits[0] ?? null,
    notionalCapPct: state.settings.notionalCapPct,
  });
  if (!sized.cappedShares || sized.cappedShares < 1) {
    out.validation = { ok: false, notes: ["Rejected: risk budget sizes this below one share/unit."] };
    out.status = "rejected";
    return out;
  }
  out.positionSize = sized.cappedShares;
  out.maxRiskUsd = Math.round(Math.abs(rec.entry - rec.stop) * sized.cappedShares);
  if (sized.capApplied) notes.push(`Single-position cap trimmed size to ${sized.cappedShares} (${state.settings.notionalCapPct}% of equity).`);

  // 5) Heat cap — open planned risk + this trade must stay under the ceiling
  const heatCapUsd = (state.settings.heatCapPct / 100) * state.settings.portfolioValue;
  const openRisk = openPlannedRiskUsd(state.trades);
  if (openRisk + out.maxRiskUsd > heatCapUsd) {
    out.validation = { ok: false, notes: [`Rejected: would push open planned risk to $${Math.round(openRisk + out.maxRiskUsd)} — over the ${state.settings.heatCapPct}% heat cap ($${Math.round(heatCapUsd)}).`] };
    out.status = "rejected";
    return out;
  }

  // 6) Copilot concurrency cap
  const copilotOpen = state.trades.filter((t) => t.status === "Open" && (t.tags || "").includes("copilot")).length;
  if (copilotOpen >= state.copilot.maxOpenFromCopilot) {
    out.validation = { ok: false, notes: [`Rejected: already ${copilotOpen} copilot positions open (cap ${state.copilot.maxOpenFromCopilot}).`] };
    out.status = "rejected";
    return out;
  }

  // 7) Duplicate guard — one live idea per asset
  const dupe = state.trades.some((t) => t.status === "Open" && t.ticker === rec.asset);
  if (dupe) notes.push(`Note: you already hold an open trade in ${rec.asset}.`);

  notes.push(`Sized by the risk engine: ${out.positionSize} units, planned risk $${out.maxRiskUsd} (${riskPct}% rule).`);
  out.validation = { ok: true, notes };
  return out;
}
