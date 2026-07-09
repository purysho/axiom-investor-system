import type { Broker, BrokerAccount, MarketClock } from "./types";

/**
 * The last gate before money moves. Everything here is deterministic and runs
 * server-side against LIVE broker state — the client cannot skip it, and the
 * Copilot's own validation (gate, heat cap, sizing) has already run before this.
 *
 * Rule: any failure means no order is submitted. There is no "warn and proceed".
 */

export interface PreflightInput {
  symbol: string;
  qty: number;
  entry: number;
  stop: number;
  side: "buy" | "sell";
  mode: "paper" | "live";
  /** Ceiling for one position as a share of broker equity. */
  notionalCapPct: number;
  /** Orders already submitted through Axiom today, for the daily cap. */
  ordersToday: number;
  maxOrdersPerDay: number;
}

export interface PreflightResult {
  ok: boolean;
  reasons: string[];
  account: BrokerAccount | null;
  clock: MarketClock | null;
  estimatedNotional: number;
  estimatedRiskUsd: number;
}

export async function preflight(broker: Broker, i: PreflightInput): Promise<PreflightResult> {
  const reasons: string[] = [];
  const estimatedNotional = i.qty * i.entry;
  const estimatedRiskUsd = Math.abs(i.entry - i.stop) * i.qty;

  // Structural checks that need no network call.
  if (!Number.isFinite(i.qty) || i.qty < 1 || !Number.isInteger(i.qty))
    reasons.push("Quantity must be a whole number of at least 1.");
  if (!(i.entry > 0) || !(i.stop > 0)) reasons.push("Entry and stop must both be positive.");
  if (i.side === "buy" && i.stop >= i.entry) reasons.push("A long order needs its stop below the entry.");
  if (i.side === "sell" && i.stop <= i.entry) reasons.push("A short order needs its stop above the entry.");
  if (i.ordersToday >= i.maxOrdersPerDay)
    reasons.push(`Daily order cap reached (${i.maxOrdersPerDay}). This is a discipline limit, not a broker one.`);

  if (reasons.length) return { ok: false, reasons, account: null, clock: null, estimatedNotional, estimatedRiskUsd };

  // Live broker state.
  const [account, clock] = await Promise.all([broker.getAccount(), broker.getClock()]);

  if (account.restricted || account.tradingBlocked)
    reasons.push("Your broker account is restricted or trading-blocked. Resolve that with the broker first.");

  if (!clock.isOpen)
    reasons.push(`The market is closed${clock.nextOpen ? ` — it reopens ${new Date(clock.nextOpen).toLocaleString()}` : ""}. Axiom does not queue orders into the open.`);

  if (i.side === "buy" && estimatedNotional > account.buyingPower)
    reasons.push(`Not enough buying power: this order needs about $${Math.round(estimatedNotional)}, you have $${Math.round(account.buyingPower)}.`);

  // Recheck the concentration cap against REAL equity, not the number typed in Settings.
  const capUsd = (i.notionalCapPct / 100) * account.equity;
  if (account.equity > 0 && estimatedNotional > capUsd)
    reasons.push(`Position would be $${Math.round(estimatedNotional)}, over your ${i.notionalCapPct}% cap on real equity ($${Math.round(capUsd)}).`);

  // Sanity: if the broker's equity is wildly different from the value Axiom sized against,
  // the sizing is meaningless. Refuse rather than silently trade the wrong size.
  if (account.equity > 0 && estimatedRiskUsd > account.equity * 0.05)
    reasons.push(`Planned risk $${Math.round(estimatedRiskUsd)} exceeds 5% of broker equity. Refusing as a hard backstop.`);

  return { ok: reasons.length === 0, reasons, account, clock, estimatedNotional, estimatedRiskUsd };
}

/** Deterministic, replayable idempotency key: same recommendation → same order id. */
export function clientOrderId(recommendationId: string, userId: string): string {
  const clean = `${userId}-${recommendationId}`.replace(/[^A-Za-z0-9-]/g, "").slice(0, 40);
  return `axiom-${clean}`;
}

/** Live trading must be switched on at the deployment level, not just in the UI. */
export function liveTradingEnabled(): boolean {
  return (process.env.ALLOW_LIVE_TRADING ?? "").toLowerCase() === "true";
}
