import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { AlpacaBroker } from "@/lib/broker/alpaca";
import { BrokerError, type BrokerMode } from "@/lib/broker/types";
import { SIM_INITIAL_EQUITY } from "@/lib/broker/sim";
import { liveTradingEnabled } from "@/lib/broker/preflight";
import { clearBrokerKeys, connectSim, saveBrokerKeys } from "@/lib/server/broker-store";
import { limited, clientIp } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

/** POST { keyId, secret, mode } — verifies the keys against the broker before storing them.
 *  POST { mode: "sim" } — activates the built-in paper simulator with no keys needed. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (limited(`broker-connect:${clientIp(req)}`, 5, 10 * 60_000))
    return NextResponse.json({ error: "Too many attempts — wait a few minutes." }, { status: 429 });

  let body: { keyId?: string; secret?: string; mode?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  // Built-in simulator path — no API keys required.
  if (body.mode === "sim") {
    await connectSim(user.id);
    await audit("broker.connected", { userId: user.id, username: user.username, req, detail: "sim paper" });
    return NextResponse.json({
      ok: true,
      mode: "paper",
      broker: "sim",
      account: { accountNumber: "SIM", equity: SIM_INITIAL_EQUITY, currency: "USD", restricted: false },
    });
  }

  const keyId = (body.keyId ?? "").trim();
  const secret = (body.secret ?? "").trim();
  const mode: BrokerMode = body.mode === "live" ? "live" : "paper";

  if (!keyId || !secret) return NextResponse.json({ error: "Both the key ID and secret are required." }, { status: 400 });
  if (mode === "live" && !liveTradingEnabled())
    return NextResponse.json({ error: "Live trading is disabled on this deployment. Paper keys only." }, { status: 403 });

  // Never store keys we haven't proven work.
  try {
    const probe = new AlpacaBroker(keyId, secret, mode);
    const account = await probe.getAccount();
    await saveBrokerKeys(user.id, keyId, secret, mode);
    await audit("broker.connected", { userId: user.id, username: user.username, req, detail: `alpaca ${mode}` });
    return NextResponse.json({
      ok: true,
      mode,
      broker: "alpaca",
      account: { accountNumber: account.accountNumber.slice(-4), equity: account.equity, currency: account.currency, restricted: account.restricted },
    });
  } catch (e) {
    const msg = e instanceof BrokerError ? e.message : "Couldn't verify those keys.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

/** DELETE — forget the stored keys. */
export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await clearBrokerKeys(user.id);
  await audit("broker.disconnected", { userId: user.id, username: user.username, req });
  return NextResponse.json({ ok: true });
}
