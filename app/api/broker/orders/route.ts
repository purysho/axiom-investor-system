import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/broker/orders — the user's order log, straight from the
 * write-ahead table. This is the record of INTENT (what AXIOM decided and
 * submitted, including failures and orders that never landed); the broker
 * remains the source of truth for fills, reconciled by /api/broker/sync.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const c = await db();
  const rows = (await c.execute({
    sql: `SELECT client_order_id, recommendation_id, broker, mode, symbol, side, qty,
                 entry, stop, take_profit, status, filled_qty, filled_avg_price,
                 submitted_at, updated_at, error
          FROM broker_orders WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 50`,
    args: [user.id],
  })).rows;

  return NextResponse.json({
    orders: rows.map((r) => ({
      clientOrderId: String(r.client_order_id),
      recommendationId: r.recommendation_id != null ? String(r.recommendation_id) : null,
      broker: String(r.broker),
      mode: String(r.mode),
      symbol: String(r.symbol),
      side: String(r.side),
      qty: Number(r.qty),
      entry: r.entry != null ? Number(r.entry) : null,
      stop: r.stop != null ? Number(r.stop) : null,
      takeProfit: r.take_profit != null ? Number(r.take_profit) : null,
      status: String(r.status),
      filledQty: Number(r.filled_qty ?? 0),
      filledAvgPrice: r.filled_avg_price != null ? Number(r.filled_avg_price) : null,
      submittedAt: String(r.submitted_at),
      error: r.error != null ? String(r.error) : null,
    })),
  });
}
