import { NextResponse } from "next/server";
import { getSessionUser, verifyPassphrase } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** POST { passphrase } → turns 2FA off. Requires the passphrase, never just a session. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { passphrase?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const c = await db();
  const res = await c.execute({ sql: "SELECT pass_salt, pass_hash FROM users WHERE id = ?", args: [user.id] });
  const r = res.rows[0];
  if (!r || !verifyPassphrase(body.passphrase ?? "", String(r.pass_salt), String(r.pass_hash)))
    return NextResponse.json({ error: "Passphrase doesn't match." }, { status: 400 });

  await c.execute({ sql: "UPDATE users SET totp_enabled = 0, totp_secret = NULL, backup_codes = NULL WHERE id = ?", args: [user.id] });
  await audit("mfa.disabled", { userId: user.id, username: user.username, req });
  return NextResponse.json({ ok: true });
}
