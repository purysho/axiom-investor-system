import { evaluateGate, openPlannedRiskUsd } from "@/lib/engine/gate";
import { describeRemaining, evaluateProtections, lockFor } from "@/lib/engine/protections";
import { computeSizing } from "@/lib/engine/sizing";
import type { AppState } from "@/lib/engine/types";
import type { AssetClass, Recommendation } from "./types";

/**
 * The deterministic gatekeeper (spec: "Execution Validator"). Every recommendation —
 * AI or rules — passes through here with the user's LIVE state before it can be shown
 * as approvable. It recomputes size from OUR risk engine (the model's numbers are
 * advisory), enforces the six-check gate as a hard interlock for new risk, and applies
 * the caps. It mutates nothing; it returns the validated copy.
 */

/** Hard bounds the validator holds every proposal to, whatever its source. */
export const VALIDATOR_LIMITS = {
  /** Confidence outside this band is either noise or overconfidence — both rejected. */
  minConfidence: 0.05,
  maxConfidence: 0.95,
  /** Minimum reward:risk when a target is stated. Below this the math can't pay for the losers. */
  minRewardRisk: 1.2,
  /** A proposal built on data older than this is trading a market that no longer exists. */
  maxDataAgeDays: 5,
  /** The execution path is US equities; other classes stay chart-only for now. */
  allowedAssetClasses: ["Equity", "ETF"] as AssetClass[],
};

/**
 * Keys whose presence means the proposal is trying to be an ORDER, not an idea.
 * Proposals are advisory by construction; anything that smells like an execution
 * instruction is rejected outright, whoever produced it.
 */
const EXECUTION_KEYS = ["execute", "autoExecute", "autoSubmit", "submitOrder", "placeOrder", "sendOrder", "liveOrder"];

export function validateRecommendation(rec: Recommendation, state: AppState, now = Date.now()): Recommendation {
  const notes: string[] = [];
  const gate = evaluateGate(state.gateInputs, state.settings, state.trades);
  const out: Recommendation = { ...rec, macro: { ...rec.macro, gateState: gate.state } };

  const reject = (note: string): Recommendation => {
    out.validation = { ok: false, notes: [...notes, note] };
    out.status = "rejected";
    out.positionSize = null;
    out.maxRiskUsd = null;
    return out;
  };

  // ── 0) Structural integrity — before anything else, whatever the source ──
  const execAttempt = EXECUTION_KEYS.find((k) => k in (rec as unknown as Record<string, unknown>));
  if (execAttempt)
    return reject(`Rejected: proposal carries an execution instruction ("${execAttempt}"). Proposals are advisory only — execution has its own guarded path.`);

  if (!rec.expiry || new Date(rec.expiry).getTime() <= now)
    return reject("Rejected: proposal has expired. Stale ideas are not trades.");

  if (!Array.isArray(rec.evidence) || rec.evidence.filter((e) => typeof e === "string" && e.trim()).length === 0)
    return reject("Rejected: no evidence given. A proposal without reasons is a hunch.");

  if (!Number.isFinite(rec.confidence) || rec.confidence < VALIDATOR_LIMITS.minConfidence || rec.confidence > VALIDATOR_LIMITS.maxConfidence)
    return reject(`Rejected: confidence ${Number.isFinite(rec.confidence) ? rec.confidence.toFixed(2) : "?"} outside sane bounds (${VALIDATOR_LIMITS.minConfidence}–${VALIDATOR_LIMITS.maxConfidence}). Certainty is a red flag, not a virtue.`);

  if (rec.dataAsOf) {
    const age = now - new Date(rec.dataAsOf).getTime();
    if (Number.isFinite(age) && age > VALIDATOR_LIMITS.maxDataAgeDays * 86_400_000)
      return reject(`Rejected: built on data from ${rec.dataAsOf} — older than ${VALIDATOR_LIMITS.maxDataAgeDays} days. Rescan before proposing.`);
  }

  const isNewRisk = rec.strategy !== "Exit review" && rec.entry !== null;

  // 1) Gate interlock — the whole point of Axiom
  if (isNewRisk && gate.state === "NO NEW SWINGS")
    return reject("Blocked: the risk check says NO NEW SWINGS. Copilot cannot open new risk today.");
  if (isNewRisk && gate.state === "REDUCED RISK ONLY") {
    notes.push("Gate is REDUCED RISK ONLY — size halved; approving records a documented exception.");
  }

  // 2) Behavioural protections — your own recent trading, not the market's.
  if (isNewRisk) {
    const lock = lockFor(evaluateProtections(state, now), rec.asset);
    if (lock)
      return reject(`Blocked: ${lock.reason}${lock.remedy ? ` ${lock.remedy}` : ""} (${describeRemaining(lock.until, now)})`);
  }

  // 3) Kill switch
  if (state.copilot.killSwitch)
    return reject("Blocked: the kill switch is on.");

  if (!isNewRisk) {
    out.validation = { ok: true, notes: ["Informational — no order attached."] };
    return out;
  }

  // 4) Asset class — new risk executes on the US-equity path only, for now
  if (!VALIDATOR_LIMITS.allowedAssetClasses.includes(rec.market))
    return reject(`Rejected: ${rec.market} proposals are chart-only for now — the execution path covers ${VALIDATOR_LIMITS.allowedAssetClasses.join("/")}.`);

  // 5) Sanity on the model's levels
  if (rec.entry === null || rec.stop === null || !(rec.entry > 0) || !(rec.stop > 0))
    return reject("Rejected: missing or invalid entry/stop.");
  if (rec.side === "Long" && rec.stop >= rec.entry)
    return reject("Rejected: long with stop above entry.");
  const stopDistPct = (Math.abs(rec.entry - rec.stop) / rec.entry) * 100;
  if (stopDistPct < 0.5 || stopDistPct > 25)
    return reject(`Rejected: stop distance ${stopDistPct.toFixed(1)}% is outside sane bounds (0.5–25%).`);

  // 6) Reward:risk — when a target is stated it has to pay for the losers
  const target = rec.takeProfits[0] ?? null;
  if (target !== null) {
    const rr = Math.abs(target - rec.entry) / Math.abs(rec.entry - rec.stop);
    if (rr < VALIDATOR_LIMITS.minRewardRisk)
      return reject(`Rejected: reward:risk ${rr.toFixed(2)} is below the ${VALIDATOR_LIMITS.minRewardRisk} floor.`);
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
  if (!sized.cappedShares || sized.cappedShares < 1)
    return reject("Rejected: risk budget sizes this below one share/unit.");
  out.positionSize = sized.cappedShares;
  out.maxRiskUsd = Math.round(Math.abs(rec.entry - rec.stop) * sized.cappedShares);
  if (sized.capApplied) notes.push(`Single-position cap trimmed size to ${sized.cappedShares} (${state.settings.notionalCapPct}% of equity).`);

  // 8) Heat cap — open planned risk + this trade must stay under the ceiling
  const heatCapUsd = (state.settings.heatCapPct / 100) * state.settings.portfolioValue;
  const openRisk = openPlannedRiskUsd(state.trades);
  if (openRisk + out.maxRiskUsd > heatCapUsd)
    return reject(`Rejected: would push open planned risk to $${Math.round(openRisk + out.maxRiskUsd)} — over the ${state.settings.heatCapPct}% heat cap ($${Math.round(heatCapUsd)}).`);

  // 9) Copilot concurrency cap
  const copilotOpen = state.trades.filter((t) => t.status === "Open" && (t.tags || "").includes("copilot")).length;
  if (copilotOpen >= state.copilot.maxOpenFromCopilot)
    return reject(`Rejected: already ${copilotOpen} copilot positions open (cap ${state.copilot.maxOpenFromCopilot}).`);

  // 10) Duplicate guard — one live idea per asset
  const dupe = state.trades.some((t) => t.status === "Open" && t.ticker === rec.asset);
  if (dupe) notes.push(`Note: you already hold an open trade in ${rec.asset}.`);

  notes.push(`Sized by the risk engine: ${out.positionSize} units, planned risk $${out.maxRiskUsd} (${riskPct}% rule).`);
  out.validation = { ok: true, notes };
  return out;
}
