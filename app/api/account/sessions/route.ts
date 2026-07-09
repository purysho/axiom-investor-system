import { NextResponse } from "next/server";
import { clearSessionCookie, getSessionUser } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** POST → "sign out everywhere": bumps token_version, invalidating every existing cookie. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const c = await db();
  await c.execute({ sql: "UPDATE users SET token_version = token_version + 1 WHERE id = ?", args: [user.id] });
  await clearSessionCookie();
  await audit("logout.all", { userId: user.id, username: user.username, req });
  return NextResponse.json({ ok: true });
}
