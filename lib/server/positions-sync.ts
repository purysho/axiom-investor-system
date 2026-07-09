import type { Broker, BrokerPosition } from "@/lib/broker/types";
import { applyCloses, detectClosedTrades, type CloseInstruction } from "@/lib/broker/close-detect";
import { db } from "./db";
import { loadUserState } from "./user-state";

/**
 * Server-side wrapper around the pure close-detector: pulls the user's synced
 * state and broker snapshots, closes journal trades whose bracket finished at
 * the broker, and persists the result. Called from the broker sync route and
 * at the start of every bot run so risk numbers stay honest.
 */
export async function reconcileClosedPositions(
  userId: string,
  broker: Broker,
  /** Pass positions if the caller already fetched them; saves a broker call. */
  prefetchedPositions?: BrokerPosition[],
): Promise<{ closed: CloseInstruction[] }> {
  const state = await loadUserState(userId);
  if (!state) return { closed: [] };

  // Any open, broker-linked trades at all? Cheap check before broker calls.
  const linked = state.recommendations.filter((r) => r.executedTradeId).map((r) => r.id);
  if (linked.length === 0) return { closed: [] };

  const c = await db();
  const filled = await c.execute({
    sql: "SELECT recommendation_id FROM broker_orders WHERE user_id = ? AND status = 'filled' AND recommendation_id IS NOT NULL",
    args: [userId],
  });
  const filledRecIds = new Set(filled.rows.map((r) => String(r.recommendation_id)));
  if (filledRecIds.size === 0) return { closed: [] };

  const [positions, recentOrders] = await Promise.all([
    prefetchedPositions ? Promise.resolve(prefetchedPositions) : broker.getPositions(),
    broker.listRecentOrders(100),
  ]);

  const closes = detectClosedTrades(state, positions, recentOrders, filledRecIds);
  if (closes.length === 0) return { closed: [] };

  const next = applyCloses(state, closes);
  await c.execute({
    sql: `INSERT INTO states (user_id, data, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    args: [userId, JSON.stringify(next), new Date().toISOString()],
  });
  return { closed: closes };
}
