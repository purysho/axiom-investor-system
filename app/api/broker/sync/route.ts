import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { BrokerError } from "@/lib/broker/types";
import { getBroker } from "@/lib/server/broker-store";
import { db } from "@/lib/server/db";
import { reconcileClosedPositions } from "@/lib/server/positions-sync";

export const dynamic = "force-dynamic";

/**
 * Reconciliation. The broker is the source of truth for what actually happened;
 * our broker_orders table is the source of truth for what we meant to happen.
 * This resolves every non-terminal row, including "pending" rows left behind by
 * a network failure where the order may or may not have landed.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const broker = await getBroker(user.id);
  if (!broker) return NextResponse.json({ error: "No broker connected." }, { status: 400 });

  const c = await db();
  const open = await c.execute({
    sql: "SELECT client_order_id FROM broker_orders WHERE user_id = ? AND status NOT IN ('filled','canceled','expired','rejected')",
    args: [user.id],
  });

  let resolved = 0, stillOpen = 0, orphansFound = 0;
  const fills: Array<{ symbol: string; qty: number; avgPrice: number | null; clientOrderId: string }> = [];

  for (const row of open.rows) {
    const coid = String(row.client_order_id);
    try {
      const order = await broker.getOrderByClientId(coid);
      if (!order) {
        // We recorded intent but the broker has no such order → it never landed.
        await c.execute({
          sql: "UPDATE broker_orders SET status = 'rejected', error = 'never reached the broker', updated_at = ? WHERE client_order_id = ?",
          args: [new Date().toISOString(), coid],
        });
        orphansFound++;
        continue;
      }
      await c.execute({
        sql: "UPDATE broker_orders SET broker_order_id = ?, status = ?, filled_qty = ?, filled_avg_price = ?, updated_at = ? WHERE client_order_id = ?",
        args: [order.brokerOrderId, order.status, order.filledQty, order.filledAvgPrice, new Date().toISOString(), coid],
      });
      if (order.status === "filled") {
        resolved++;
        fills.push({ symbol: order.symbol, qty: order.filledQty, avgPrice: order.filledAvgPrice, clientOrderId: coid });
      } else if (["canceled", "expired", "rejected"].includes(order.status)) {
        resolved++;
      } else {
        stillOpen++;
      }
    } catch (e) {
      if (e instanceof BrokerError && e.retryable) {
        return NextResponse.json({ error: e.message, partial: true, resolved }, { status: 502 });
      }
      stillOpen++;
    }
  }

  let positions = null;
  try { positions = await broker.getPositions(); } catch { /* non-fatal */ }

  // Close journal trades whose bracket finished at the broker (stop or target
  // leg filled). Keeps the gate's open-risk numbers honest and feeds the
  // paper track record. Non-fatal: a failure here never blocks the sync.
  let closedTrades: Awaited<ReturnType<typeof reconcileClosedPositions>>["closed"] = [];
  if (positions) {
    try { closedTrades = (await reconcileClosedPositions(user.id, broker, positions)).closed; } catch { /* next sync */ }
  }

  return NextResponse.json({ ok: true, resolved, stillOpen, orphansFound, fills, positions, closedTrades });
}
