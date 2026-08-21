import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { limited } from "@/lib/server/ratelimit";
import { getBotSettings, runBotForUser } from "@/lib/server/bot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/bot/run  { dryRun?: boolean }
 * Run the bot once, now, for the signed-in user. A dry run evaluates the whole
 * pipeline and reports what WOULD happen without submitting anything — it also
 * works while the bot is disabled, so you can rehearse before switching it on.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (limited(`botrun:${user.id}`, 4, 5 * 60_000))
    return NextResponse.json({ error: "Too many runs — the bot works on daily bars; give it a few minutes." }, { status: 429 });

  let dryRun = false;
  try {
    const b = await req.json();
    dryRun = Boolean(b?.dryRun);
  } catch { /* empty body = real run */ }

  const settings = await getBotSettings(user.id);
  if (!settings.enabled && !dryRun)
    return NextResponse.json({ error: "The bot is switched off. Enable it first, or use a dry run to preview." }, { status: 400 });

  const report = await runBotForUser(user.id, "manual", dryRun);
  return NextResponse.json({ ok: true, report });
}
