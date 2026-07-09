import { NextResponse } from "next/server";
import { getSessionUser, hashPassphrase, verifyPassphrase } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { current?: string; next?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.next || body.next.length < 8)
    return NextResponse.json({ error: "New passphrase must be at least 8 characters." }, { status: 400 });

  const c = await db();
  const r = await c.execute({ sql: "SELECT pass_salt, pass_hash FROM users WHERE id = ?", args: [user.id] });
  if (!verifyPassphrase(body.current ?? "", String(r.rows[0].pass_salt), String(r.rows[0].pass_hash)))
    return NextResponse.json({ error: "Current passphrase is wrong." }, { status: 401 });

  const { salt, hash } = hashPassphrase(body.next);
  await c.execute({ sql: "UPDATE users SET pass_salt = ?, pass_hash = ?, token_version = token_version + 1 WHERE id = ?", args: [salt, hash, user.id] });
  return NextResponse.json({ ok: true });
}
