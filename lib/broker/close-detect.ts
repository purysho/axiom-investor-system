import type { BrokerOrder, BrokerPosition } from "./types";
import type { AppState, Trade } from "@/lib/engine/types";

/**
 * Detects journal trades whose broker-side bracket has finished.
 *
 * A trade enters the journal "Open" when its entry order fills. The protective
 * stop and the take-profit live at the BROKER as bracket legs — so when one of
 * them fills, the journal has no idea and keeps the trade open forever. That
 * inflates the gate's open-risk check, blocks re-entry via the duplicate guard,
 * and starves the paper track record everything else is waiting on.
 *
 * Pure function: state + broker snapshots in, close instructions out. The
 * caller applies them and persists. Only trades that are provably
 * broker-managed are touched — provable means the trade is linked, via its
 * recommendation, to an order we recorded in broker_orders before submitting.
 */

export interface CloseInstruction {
  tradeId: string;
  symbol: string;
  exitPrice: number;
  exitDate: string;          // YYYY-MM-DD
  exitReason: Trade["exitReason"];
  note: string;
}

export function detectClosedTrades(
  state: AppState,
  /** Symbols with a live position at the broker (any qty ≠ 0). */
  positions: BrokerPosition[],
  /** Recent orders from the broker, newest first is fine but not required. */
  recentOrders: BrokerOrder[],
  /** recommendation_ids that have a filled entry recorded in broker_orders. */
  brokerFilledRecIds: Set<string>,
): CloseInstruction[] {
  const held = new Set(positions.filter((p) => p.qty !== 0).map((p) => p.symbol.toUpperCase()));

  // Trade → recommendation linkage: only recs that really went to the broker.
  const brokerTradeIds = new Set(
    state.recommendations
      .filter((r) => r.executedTradeId && brokerFilledRecIds.has(r.id))
      .map((r) => r.executedTradeId as string),
  );

  const out: CloseInstruction[] = [];
  for (const t of state.trades) {
    if (t.status !== "Open" || !brokerTradeIds.has(t.id)) continue;
    const symbol = t.ticker.toUpperCase();
    if (held.has(symbol)) continue; // still on the book — nothing to do

    // The position is gone. Find the sell fill that closed it.
    const closingFill = recentOrders
      .filter((o) =>
        o.symbol.toUpperCase() === symbol &&
        o.side === "sell" &&
        o.status === "filled" &&
        o.filledAvgPrice !== null &&
        o.submittedAt.slice(0, 10) >= t.entryDate,
      )
      .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))[0];

    // No sell fill in the window → we can't prove how it closed. Fabricating an
    // exit would corrupt the journal; leave it for the user or a later sync.
    if (!closingFill) continue;

    const fill = closingFill.filledAvgPrice as number;
    let exitReason: Trade["exitReason"] = "Manual/Discretionary";
    if (t.stop !== null && fill <= t.stop * 1.02) exitReason = "Stop";
    else if (t.target !== null && fill >= t.target * 0.98) exitReason = "Target";

    out.push({
      tradeId: t.id,
      symbol,
      exitPrice: fill,
      exitDate: closingFill.submittedAt.slice(0, 10),
      exitReason,
      note: `Bracket leg filled at ${fill} (${exitReason.toLowerCase()}).`,
    });
  }
  return out;
}

/** Apply close instructions to a state copy. Reflections stay empty on purpose —
 *  the protections lock until the user reflects, and that is the methodology. */
export function applyCloses(state: AppState, closes: CloseInstruction[]): AppState {
  if (closes.length === 0) return state;
  const byId = new Map(closes.map((c) => [c.tradeId, c]));
  return {
    ...state,
    trades: state.trades.map((t) => {
      const c = byId.get(t.id);
      if (!c) return t;
      return {
        ...t,
        status: "Closed" as const,
        exitDate: c.exitDate,
        exitPrice: c.exitPrice,
        exitReason: c.exitReason,
      };
    }),
  };
}
