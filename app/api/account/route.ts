import { NextResponse } from "next/server";
import { getSessionUser, setSessionCookie } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const c = await db();
  const r = await c.execute({ sql: "SELECT display_name, share_group, totp_enabled FROM users WHERE id = ?", args: [user.id] });
  return NextResponse.json({
    username: user.username,
    displayName: String(r.rows[0].display_name),
    shareGroup: Number(r.rows[0].share_group) === 1,
    mfaEnabled: Number(r.rows[0].totp_enabled ?? 0) === 1,
  });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { displayName?: string; shareGroup?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const c = await db();
  if (typeof body.displayName === "string" && body.displayName.trim()) {
    const dn = body.displayName.trim().slice(0, 40);
    await c.execute({ sql: "UPDATE users SET display_name = ? WHERE id = ?", args: [dn, user.id] });
    await setSessionCookie({ ...user, displayName: dn });
  }
  if (typeof body.shareGroup === "boolean") {
    await c.execute({ sql: "UPDATE users SET share_group = ? WHERE id = ?", args: [body.shareGroup ? 1 : 0, user.id] });
  }
  return NextResponse.json({ ok: true });
}
