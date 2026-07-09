import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { BrokerError } from "@/lib/broker/types";
import { liveTradingEnabled } from "@/lib/broker/preflight";
import { getBroker, getConnection, ordersToday } from "@/lib/server/broker-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const conn = await getConnection(user.id);
  if (!conn) return NextResponse.json({ connected: false, liveAllowed: liveTradingEnabled() });

  try {
    const broker = await getBroker(user.id);
    if (!broker) return NextResponse.json({ connected: false, liveAllowed: liveTradingEnabled() });
    const [account, positions, clock] = await Promise.all([broker.getAccount(), broker.getPositions(), broker.getClock()]);
    return NextResponse.json({
      connected: true,
      liveAllowed: liveTradingEnabled(),
      mode: conn.mode,
      keyHint: conn.keyHint,
      connectedAt: conn.connectedAt,
      ordersToday: await ordersToday(user.id),
      account,
      positions,
      clock,
    });
  } catch (e) {
    const msg = e instanceof BrokerError ? e.message : "Couldn't reach the broker.";
    return NextResponse.json({ connected: true, mode: conn.mode, liveAllowed: liveTradingEnabled(), error: msg }, { status: 200 });
  }
}
