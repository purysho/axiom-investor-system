/**
 * Phase-1 Copilot types, following the AXIOM AI Copilot Training Specification's
 * Recommendation Object. The AI (or the deterministic fallback analyst) produces
 * these; deterministic code alone validates, sizes, and — on the user's approval —
 * paper-executes them. LLMs never touch orders.
 */

export type RecStatus = "proposed" | "approved" | "dismissed" | "expired" | "rejected";
export type RecSide = "Long" | "Short";
export type RecStrategy = "Trend pullback" | "Mean reversion" | "Rebalance" | "DCA" | "Exit review";
export type AssetClass = "Equity" | "ETF" | "Crypto" | "Metal" | "FX" | "Other";

export interface Recommendation {
  id: string;
  createdAt: string;            // ISO
  expiry: string;               // ISO — stale ideas die by default
  status: RecStatus;

  // Spec: Recommendation Object
  asset: string;                // ticker as the user knows it
  market: AssetClass;
  timeframe: "Daily";
  side: RecSide;
  strategy: RecStrategy;
  entry: number | null;         // null for non-order recs (e.g. exit review)
  stop: number | null;
  takeProfits: number[];
  positionSize: number | null;  // shares/units — ALWAYS recomputed by our sizing engine
  maxRiskUsd: number | null;    // planned 1R in dollars at approved size
  confidence: number;           // 0–1, model/heuristic self-rating — not a probability of profit
  evidence: string[];           // plain-English reasons, one per line
  /** Plain-English condition that voids the thesis (e.g. "daily close below the stop"). */
  invalidation?: string | null;
  /** Date/timestamp of the newest data bar the proposal was built from. */
  dataAsOf?: string | null;
  technical: Record<string, number | string | null>;
  macro: { gateState: string; note?: string };
  sentiment?: string | null;
  citations: string[];          // data sources, e.g. "Stooq daily (delayed)"

  // Audit
  source: "ai" | "rules";
  validation: { ok: boolean; notes: string[] };  // what the deterministic layer decided
  executedTradeId?: string;     // journal trade created on approval (paper)
}

export interface CopilotSettings {
  killSwitch: boolean;          // true = copilot generates nothing, approves nothing
  mode: "copilot";              // autopilot is a later unlock, deliberately absent
  maxOpenFromCopilot: number;   // cap on simultaneous copilot-originated open trades
  lastScanAt: string | null;
}

export const DEFAULT_COPILOT: CopilotSettings = {
  killSwitch: false,
  mode: "copilot",
  maxOpenFromCopilot: 3,
  lastScanAt: null,
};
