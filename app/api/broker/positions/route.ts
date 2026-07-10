import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { BrokerError } from "@/lib/broker/types";
import { summarizeAccount } from "@/lib/broker/account-summary";
import { getBroker, getConnection } from "@/lib/server/broker-store";
import { limited } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/broker/positions — the live-account snapshot the dashboard polls:
 * equity, cash, market clock, and open positions with unrealized P&L.
 * Read-only; unlike /api/broker/sync it reconciles nothing, so it is cheap
 * enough to poll while a tab is open.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (limited(`positions:${user.id}`, 30, 5 * 60_000))
    return NextResponse.json({ error: "Polling too fast — broker state doesn't move that quickly." }, { status: 429 });

  const conn = await getConnection(user.id);
  const broker = await getBroker(user.id);
  if (!conn || !broker) return NextResponse.json({ connected: false });

  try {
    const [account, positions, clock] = await Promise.all([
      broker.getAccount(),
      broker.getPositions(),
      broker.getClock(),
    ]);
    return NextResponse.json({
      connected: true,
      mode: conn.mode,
      summary: summarizeAccount(account, positions),
      positions,
      clock,
      asOf: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof BrokerError ? e.message : "Couldn't reach the broker.";
    return NextResponse.json({ connected: true, mode: conn.mode, error: msg }, { status: 502 });
  }
}
