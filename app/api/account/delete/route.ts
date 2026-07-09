import { NextResponse } from "next/server";
import { clearSessionCookie, getSessionUser, verifyPassphrase } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { passphrase?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const c = await db();
  const res = await c.execute({ sql: "SELECT pass_salt, pass_hash FROM users WHERE id = ?", args: [session.id] });
  const row = res.rows[0];
  if (!row || !verifyPassphrase(body.passphrase ?? "", String(row.pass_salt), String(row.pass_hash)))
    return NextResponse.json({ error: "Passphrase doesn't match." }, { status: 400 });

  await c.batch(
    [
      { sql: "DELETE FROM states WHERE user_id = ?", args: [session.id] },
      { sql: "UPDATE invites SET used_by = NULL WHERE used_by = ?", args: [session.id] },
      { sql: "DELETE FROM users WHERE id = ?", args: [session.id] },
    ],
    "write",
  );
  await audit("account.deleted", { userId: null, username: session.username, req, detail: "user-initiated" });
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
