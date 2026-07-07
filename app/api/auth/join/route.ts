import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { hashPassphrase, setSessionCookie } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export async function POST(req: Request) {
  let body: { invite?: string; username?: string; displayName?: string; passphrase?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const invite = (body.invite ?? "").trim().toUpperCase();
  const username = (body.username ?? "").trim().toLowerCase();
  const displayName = (body.displayName ?? "").trim() || username;
  const passphrase = body.passphrase ?? "";

  if (!invite) return NextResponse.json({ error: "An invite code is required." }, { status: 400 });
  if (!/^[a-z0-9_.-]{3,32}$/.test(username))
    return NextResponse.json({ error: "Username: 3–32 chars, letters/numbers/._- only." }, { status: 400 });
  if (passphrase.length < 8)
    return NextResponse.json({ error: "Passphrase must be at least 8 characters." }, { status: 400 });

  const c = await db();

  const inv = await c.execute({ sql: "SELECT code, used_by FROM invites WHERE code = ?", args: [invite] });
  if (inv.rows.length === 0 || inv.rows[0].used_by)
    return NextResponse.json({ error: "That invite code isn't valid (or was already used)." }, { status: 400 });

  const existing = await c.execute({ sql: "SELECT id FROM users WHERE username = ?", args: [username] });
  if (existing.rows.length > 0)
    return NextResponse.json({ error: "That username is taken." }, { status: 400 });

  const id = `U${randomBytes(8).toString("hex")}`;
  const { salt, hash } = hashPassphrase(passphrase);
  const now = new Date().toISOString();

  await c.batch(
    [
      {
        sql: "INSERT INTO users (id, username, display_name, pass_salt, pass_hash, share_group, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
        args: [id, username, displayName, salt, hash, now],
      },
      { sql: "UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?", args: [id, now, invite] },
    ],
    "write",
  );

  await setSessionCookie({ id, username, displayName });
  return NextResponse.json({ ok: true, user: { username, displayName } });
}
