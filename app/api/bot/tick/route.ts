import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { listEnabledBotUsers, runBotForUser } from "@/lib/server/bot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/bot/tick — the scheduler's entry point. An external cron (Fly
 * machines schedule, GitHub Actions, cron-job.org, `curl` in crontab) calls
 * this once or twice during market hours with the deployment's BOT_CRON_TOKEN.
 *
 * Fail-closed: no token configured → the endpoint is dead. Wrong token → 401
 * with no detail. The middleware deliberately lets this path through; THIS
 * check is the door.
 */
function authorized(req: Request): boolean {
  const configured = process.env.BOT_CRON_TOKEN ?? "";
  if (configured.length < 16) return false;
  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : (req.headers.get("x-axiom-cron-token") ?? "");
  const a = Buffer.from(presented);
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    // 503 when unconfigured (so operators notice), 401 when the token is wrong.
    const status = (process.env.BOT_CRON_TOKEN ?? "").length < 16 ? 503 : 401;
    return NextResponse.json({ error: status === 503 ? "Bot scheduling is not configured on this deployment (BOT_CRON_TOKEN)." : "unauthorized" }, { status });
  }

  const users = await listEnabledBotUsers();
  const results: Array<{ userId: string; outcome: string; summary: string; ordersPlaced: number }> = [];
  // Sequential on purpose: bounded load on the data source and the broker API.
  for (const userId of users) {
    try {
      const report = await runBotForUser(userId, "cron");
      results.push({
        userId: userId.slice(0, 8),
        outcome: report.outcome,
        summary: report.summary,
        ordersPlaced: report.orders.filter((o) => o.status !== "blocked" && o.status !== "dry-run").length,
      });
    } catch {
      results.push({ userId: userId.slice(0, 8), outcome: "error", summary: "run crashed", ordersPlaced: 0 });
    }
  }

  return NextResponse.json({ ok: true, users: users.length, results });
}
