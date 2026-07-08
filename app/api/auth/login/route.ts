import { NextResponse } from "next/server";
import { setSessionCookie, verifyPassphrase } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { clientIp, limited } from "@/lib/server/ratelimit";

export async function POST(req: Request) {
  if (limited(`login:${clientIp(req)}`, 6, 5 * 60_000))
    return NextResponse.json({ error: "Too many sign-in attempts — try again in a few minutes." }, { status: 429 });

  let body: { username?: string; passphrase?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const username = (body.username ?? "").trim().toLowerCase();
  const passphrase = body.passphrase ?? "";

  const c = await db();
  const res = await c.execute({
    sql: "SELECT id, username, display_name, pass_salt, pass_hash FROM users WHERE username = ?",
    args: [username],
  });
  const generic = NextResponse.json({ error: "Wrong username or passphrase." }, { status: 401 });
  if (res.rows.length === 0) return generic;
  const r = res.rows[0];
  if (!verifyPassphrase(passphrase, String(r.pass_salt), String(r.pass_hash))) return generic;

  await setSessionCookie({ id: String(r.id), username: String(r.username), displayName: String(r.display_name) });
  return NextResponse.json({ ok: true });
}
