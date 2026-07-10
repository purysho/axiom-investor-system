import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { getConnection } from "@/lib/server/broker-store";
import { getBotSettings, listBotRuns, saveBotSettings } from "@/lib/server/bot";

export const dynamic = "force-dynamic";

const SYMBOL_RE = /^[A-Za-z0-9.^-]{1,12}$/;

/** GET /api/bot — the bot's settings, broker context, and recent runs. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [settings, conn, runs] = await Promise.all([
    getBotSettings(user.id),
    getConnection(user.id),
    listBotRuns(user.id, 15),
  ]);
  return NextResponse.json({
    settings,
    broker: conn ? { broker: conn.broker, mode: conn.mode, keyHint: conn.keyHint } : null,
    runs,
    cronConfigured: Boolean(process.env.BOT_CRON_TOKEN),
  });
}

/** POST /api/bot — update settings. Enabling requires a PAPER broker connection. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let b: { enabled?: unknown; universe?: unknown; maxOrdersPerRun?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const current = await getBotSettings(user.id);
  const next = { ...current };

  if (b.universe !== undefined) {
    if (!Array.isArray(b.universe)) return NextResponse.json({ error: "universe must be an array of tickers." }, { status: 400 });
    next.universe = [...new Set(
      b.universe
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => SYMBOL_RE.test(s)),
    )].slice(0, 8);
  }
  if (b.maxOrdersPerRun !== undefined) {
    const n = Number(b.maxOrdersPerRun);
    next.maxOrdersPerRun = Number.isFinite(n) ? Math.max(1, Math.min(3, Math.round(n))) : current.maxOrdersPerRun;
  }
  if (b.enabled !== undefined) {
    const wantOn = Boolean(b.enabled);
    if (wantOn && !current.enabled) {
      const conn = await getConnection(user.id);
      if (!conn) return NextResponse.json({ error: "Connect a paper broker in Settings before enabling the bot (Alpaca paper account or the built-in simulator)." }, { status: 400 });
      if (conn.mode !== "paper") return NextResponse.json({ error: "The bot only trades paper accounts. Your connection is LIVE — reconnect in paper mode to use the bot." }, { status: 400 });
    }
    next.enabled = wantOn;
  }

  await saveBotSettings(user.id, next);
  if (b.enabled !== undefined && Boolean(b.enabled) !== current.enabled) {
    await audit(next.enabled ? "bot.enabled" : "bot.disabled", { userId: user.id, username: user.username, req, detail: `universe: ${next.universe.join(",") || "(trade ideas)"}` });
  }
  return NextResponse.json({ ok: true, settings: next });
}
