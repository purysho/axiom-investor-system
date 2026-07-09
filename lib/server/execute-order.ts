import { BrokerError, type Broker, type BrokerMode, type BrokerOrder } from "@/lib/broker/types";
import { db } from "./db";

/**
 * The one code path that moves an order from "decided" to "at the broker".
 * Both the manual order route and the AXIOM bot call this — there is no second
 * implementation to drift.
 *
 * Contract: preflight has already passed. This function only does the
 * write-ahead record, the idempotent submit, and the status update.
 *
 * Time-in-force is GTC on purpose: Alpaca applies one TIF to every leg of a
 * bracket, and a "day" bracket cancels its unfilled protective legs at the
 * close — which would leave a swing position held overnight with NO stop.
 * The entry is a market order submitted only while the market is open (a
 * preflight rule), so GTC costs nothing there and keeps the stop alive.
 */

export interface ExecuteOrderInput {
  userId: string;
  broker: Broker;
  mode: BrokerMode;
  clientOrderId: string;
  recommendationId: string | null;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  entry: number;
  stop: number;
  takeProfit: number | null;
}

export type ExecuteOrderResult =
  | { kind: "duplicate"; status: string }
  | { kind: "submitted"; order: BrokerOrder }
  | { kind: "failed"; message: string; retryable: boolean };

export async function executeVerifiedOrder(i: ExecuteOrderInput): Promise<ExecuteOrderResult> {
  const c = await db();
  const now = new Date().toISOString();

  // Write-ahead: record intent BEFORE submitting. If we crash mid-flight, the
  // row exists and reconciliation can find the order by client_order_id.
  try {
    await c.execute({
      sql: `INSERT INTO broker_orders
            (client_order_id, user_id, recommendation_id, broker, mode, symbol, side, qty, entry, stop, take_profit, status, submitted_at, updated_at)
            VALUES (?, ?, ?, 'alpaca', ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      args: [i.clientOrderId, i.userId, i.recommendationId, i.mode, i.symbol, i.side, i.qty, i.entry, i.stop, i.takeProfit, now, now],
    });
  } catch {
    // Primary-key clash = this intent was already submitted. Idempotent: report the existing order.
    const existing = (await c.execute({ sql: "SELECT status FROM broker_orders WHERE client_order_id = ?", args: [i.clientOrderId] })).rows[0];
    return { kind: "duplicate", status: String(existing?.status ?? "unknown") };
  }

  try {
    const order = await i.broker.submitBracketOrder({
      symbol: i.symbol, qty: i.qty, side: i.side,
      stopPrice: i.stop,
      takeProfitPrice: i.takeProfit,
      clientOrderId: i.clientOrderId,
      timeInForce: "gtc",
    });
    await c.execute({
      sql: "UPDATE broker_orders SET broker_order_id = ?, status = ?, filled_qty = ?, filled_avg_price = ?, updated_at = ? WHERE client_order_id = ?",
      args: [order.brokerOrderId, order.status, order.filledQty, order.filledAvgPrice, new Date().toISOString(), i.clientOrderId],
    });
    return { kind: "submitted", order };
  } catch (e) {
    const msg = e instanceof BrokerError ? e.message : "The broker rejected the order.";
    const retryable = e instanceof BrokerError && e.retryable;
    // "pending" is deliberate on network failures: the order MIGHT exist at the broker.
    // Reconciliation resolves it; we never silently retry and risk a double position.
    await c.execute({
      sql: "UPDATE broker_orders SET status = ?, error = ?, updated_at = ? WHERE client_order_id = ?",
      args: [retryable ? "pending" : "rejected", msg.slice(0, 200), new Date().toISOString(), i.clientOrderId],
    });
    return { kind: "failed", message: msg, retryable };
  }
}
