import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { BrokerError } from "@/lib/broker/types";
import { clientOrderId, liveTradingEnabled, preflight } from "@/lib/broker/preflight";
import { getBroker, getConnection, ordersToday } from "@/lib/server/broker-store";
import { executeVerifiedOrder } from "@/lib/server/execute-order";
import { clientIp, limited } from "@/lib/server/ratelimit";
import { loadUserState } from "@/lib/server/user-state";
import { evaluateGate } from "@/lib/engine/gate";
import { describeRemaining, evaluateProtections, lockFor } from "@/lib/engine/protections";

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

  // ── Interlock 1: the risk gate and behavioural protections, re-derived from
  //    the user's SYNCED state. The client's `gateState` is a hint, not a source
  //    of truth: a tampered request cannot talk its way past a closed gate.
  const synced = await loadUserState(user.id);
  if (synced) {
    const gate = evaluateGate(synced.gateInputs, synced.settings, synced.trades);
    if (gate.state === "NO NEW SWINGS") {
      await audit("order.blocked", { userId: user.id, username: user.username, req, detail: `${b.symbol}: gate closed (server)` });
      return NextResponse.json({ error: "The risk check says NO NEW SWINGS. Axiom will not open new risk today." }, { status: 403 });
    }
    const lock = lockFor(evaluateProtections(synced), b.symbol);
    if (lock) {
      await audit("order.blocked", { userId: user.id, username: user.username, req, detail: `${b.symbol}: ${lock.id}` });
      return NextResponse.json(
        { error: lock.reason, remedy: lock.remedy, lockedFor: describeRemaining(lock.until), protection: lock.id },
        { status: 403 },
      );
    }
  } else {
    // No synced state on the server. We cannot verify the gate or the protections,
    // and a client's word is not evidence. Refuse rather than trust — the same
    // fail-closed stance the session secret takes.
    await audit("order.blocked", { userId: user.id, username: user.username, req, detail: `${b.symbol}: no synced state` });
    return NextResponse.json(
      { error: "Axiom can't verify your risk check on the server yet.",
        remedy: "Open Axiom while signed in so your data syncs, then try again. Orders are never placed on unverified state." },
      { status: 409 },
    );
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

  // ── Write-ahead + idempotent submit via the shared executor. ─────────────
  const result = await executeVerifiedOrder({
    userId: user.id, broker, mode: conn.mode, clientOrderId: coid,
    recommendationId: b.recommendationId ?? null,
    symbol: b.symbol, side, qty: Number(b.qty), entry: Number(b.entry), stop: Number(b.stop),
    takeProfit: b.takeProfit ?? null,
  });

  if (result.kind === "duplicate") {
    return NextResponse.json({
      ok: true, duplicate: true, clientOrderId: coid,
      status: result.status,
      message: "That recommendation was already submitted — no second order was placed.",
    });
  }
  if (result.kind === "submitted") {
    await audit("order.submitted", {
      userId: user.id, username: user.username, req,
      detail: `${conn.mode}: ${side} ${b.qty} ${b.symbol} @${b.entry} stop ${b.stop} → ${result.order.status}`,
    });
    return NextResponse.json({ ok: true, order: result.order, mode: conn.mode, clientOrderId: coid });
  }
  await audit("order.rejected", { userId: user.id, username: user.username, req, detail: `${b.symbol}: ${result.message}`.slice(0, 150) });
  return NextResponse.json(
    { ok: false, error: result.message, uncertain: result.retryable, clientOrderId: coid,
      hint: result.retryable ? "The order may or may not have reached the broker. Run Sync before retrying." : undefined },
    { status: 502 },
  );
}
