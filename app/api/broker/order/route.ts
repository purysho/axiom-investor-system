import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { BrokerError } from "@/lib/broker/types";
import { clientOrderId, liveTradingEnabled, preflight } from "@/lib/broker/preflight";
import { getBroker, getConnection, ordersToday } from "@/lib/server/broker-store";
import { db } from "@/lib/server/db";
import { clientIp, limited } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

const MAX_ORDERS_PER_DAY = 5;

interface OrderBody {
  recommendationId: string;
  symbol: string;
  qty: number;
  entry: number;
  stop: number;
  takeProfit?: number | null;
  side?: "buy" | "sell";
  /** Client must echo the gate state it saw; server re-derives the decision anyway. */
  gateState: string;
  notionalCapPct: number;
  /** Typed by the user for live orders. Paper orders don't need it. */
  confirmation?: string;
  /** true = just run the checks and report, submit nothing. */
  dryRun?: boolean;
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (limited(`order:${user.id}`, 10, 5 * 60_000))
    return NextResponse.json({ error: "Too many order attempts — slow down." }, { status: 429 });

  let b: OrderBody;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const conn = await getConnection(user.id);
  const broker = await getBroker(user.id);
  if (!conn || !broker) return NextResponse.json({ error: "No broker connected. Connect one in Settings." }, { status: 400 });

  // ── Interlock 1: the risk gate. Server-side, non-negotiable. ─────────────
  if (b.gateState === "NO NEW SWINGS") {
    await audit("order.blocked", { userId: user.id, username: user.username, req, detail: `${b.symbol}: gate closed` });
    return NextResponse.json({ error: "The risk check says NO NEW SWINGS. Axiom will not open new risk today." }, { status: 403 });
  }

  // ── Interlock 2: live trading must be enabled at deploy level AND confirmed. ──
  if (conn.mode === "live") {
    if (!liveTradingEnabled())
      return NextResponse.json({ error: "Live trading is disabled on this deployment." }, { status: 403 });
    if ((b.confirmation ?? "").trim().toUpperCase() !== "PLACE LIVE ORDER")
      return NextResponse.json({ error: 'Type "PLACE LIVE ORDER" to confirm a real-money order.' }, { status: 400 });
  }

  const side = b.side === "sell" ? "sell" : "buy";
  const coid = clientOrderId(b.recommendationId, user.id);

  // ── Interlock 3: deterministic preflight against LIVE broker state. ──────
  let pre;
  try {
    pre = await preflight(broker, {
      symbol: b.symbol, qty: Number(b.qty), entry: Number(b.entry), stop: Number(b.stop), side,
      mode: conn.mode, notionalCapPct: Number(b.notionalCapPct) || 20,
      ordersToday: await ordersToday(user.id), maxOrdersPerDay: MAX_ORDERS_PER_DAY,
    });
  } catch (e) {
    const msg = e instanceof BrokerError ? e.message : "Couldn't check your broker account.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (!pre.ok) {
    await audit("order.blocked", { userId: user.id, username: user.username, req, detail: `${b.symbol}: ${pre.reasons[0] ?? ""}` });
    return NextResponse.json({ ok: false, blocked: true, reasons: pre.reasons }, { status: 200 });
  }

  if (b.dryRun) {
    return NextResponse.json({
      ok: true, dryRun: true, clientOrderId: coid, mode: conn.mode,
      estimatedNotional: pre.estimatedNotional, estimatedRiskUsd: pre.estimatedRiskUsd,
      equity: pre.account?.equity ?? null, marketOpen: pre.clock?.isOpen ?? null,
    });
  }

  // ── Write-ahead: record intent BEFORE submitting. If we crash mid-flight, the
  //    row exists and reconciliation can find the order by client_order_id. ──
  const c = await db();
  const now = new Date().toISOString();
  try {
    await c.execute({
      sql: `INSERT INTO broker_orders
            (client_order_id, user_id, recommendation_id, broker, mode, symbol, side, qty, entry, stop, take_profit, status, submitted_at, updated_at)
            VALUES (?, ?, ?, 'alpaca', ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      args: [coid, user.id, b.recommendationId ?? null, conn.mode, b.symbol, side, Number(b.qty), Number(b.entry), Number(b.stop), b.takeProfit ?? null, now, now],
    });
  } catch {
    // Primary-key clash = this recommendation was already submitted. Idempotent: report the existing order.
    const existing = (await c.execute({ sql: "SELECT * FROM broker_orders WHERE client_order_id = ?", args: [coid] })).rows[0];
    return NextResponse.json({
      ok: true, duplicate: true, clientOrderId: coid,
      status: String(existing?.status ?? "unknown"),
      message: "That recommendation was already submitted — no second order was placed.",
    });
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  try {
    const order = await broker.submitBracketOrder({
      symbol: b.symbol, qty: Number(b.qty), side,
      stopPrice: Number(b.stop),
      takeProfitPrice: b.takeProfit ?? null,
      clientOrderId: coid,
      timeInForce: "day",
    });
    await c.execute({
      sql: "UPDATE broker_orders SET broker_order_id = ?, status = ?, filled_qty = ?, filled_avg_price = ?, updated_at = ? WHERE client_order_id = ?",
      args: [order.brokerOrderId, order.status, order.filledQty, order.filledAvgPrice, new Date().toISOString(), coid],
    });
    await audit("order.submitted", {
      userId: user.id, username: user.username, req,
      detail: `${conn.mode}: ${side} ${b.qty} ${b.symbol} @${b.entry} stop ${b.stop} → ${order.status}`,
    });
    return NextResponse.json({ ok: true, order, mode: conn.mode, clientOrderId: coid });
  } catch (e) {
    const msg = e instanceof BrokerError ? e.message : "The broker rejected the order.";
    const retryable = e instanceof BrokerError && e.retryable;
    await c.execute({
      sql: "UPDATE broker_orders SET status = ?, error = ?, updated_at = ? WHERE client_order_id = ?",
      args: [retryable ? "pending" : "rejected", msg.slice(0, 200), new Date().toISOString(), coid],
    });
    // "pending" is deliberate on network failures: the order MIGHT exist at the broker.
    // Reconciliation resolves it; we never silently retry and risk a double position.
    await audit("order.rejected", { userId: user.id, username: user.username, req, detail: `${b.symbol}: ${msg}`.slice(0, 150) });
    return NextResponse.json(
      { ok: false, error: msg, uncertain: retryable, clientOrderId: coid,
        hint: retryable ? "The order may or may not have reached the broker. Run Sync before retrying." : undefined },
      { status: 502 },
    );
  }
}
