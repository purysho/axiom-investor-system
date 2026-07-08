import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { hashPassphrase, setSessionCookie } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { clientIp, limited } from "@/lib/server/ratelimit";
import { signupsOpen } from "@/lib/server/signup";

export const dynamic = "force-dynamic";

/** Human-friendly one-time recovery code: AXR-XXXX-XXXX (no 0/O/1/I). */
function makeRecoveryCode(): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const pick = () => alphabet[randomBytes(1)[0] % alphabet.length];
  const block = () => Array.from({ length: 4 }, pick).join("");
  return `AXR-${block()}-${block()}`;
}

export async function POST(req: Request) {
  if (limited(`join:${clientIp(req)}`, 8, 10 * 60_000))
    return NextResponse.json({ error: "Too many sign-up attempts — try again in a few minutes." }, { status: 429 });

  let body: { invite?: string; username?: string; displayName?: string; passphrase?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const open = signupsOpen();
  const invite = (body.invite ?? "").trim().toUpperCase();
  const username = (body.username ?? "").trim().toLowerCase();
  const displayName = (body.displayName ?? "").trim() || username;
  const passphrase = body.passphrase ?? "";

  if (!open && !invite) return NextResponse.json({ error: "An invite code is required." }, { status: 400 });
  if (!/^[a-z0-9_.-]{3,32}$/.test(username))
    return NextResponse.json({ error: "Username: 3–32 chars, letters/numbers/._- only." }, { status: 400 });
  if (passphrase.length < 8)
    return NextResponse.json({ error: "Passphrase must be at least 8 characters." }, { status: 400 });
  if (displayName.length > 40)
    return NextResponse.json({ error: "Display name: 40 characters max." }, { status: 400 });

  const c = await db();

  // An invite, if supplied, must be valid — and is consumed — even when signups are open.
  if (invite) {
    const inv = await c.execute({ sql: "SELECT code, used_by FROM invites WHERE code = ?", args: [invite] });
    if (inv.rows.length === 0 || inv.rows[0].used_by)
      return NextResponse.json({ error: "That invite code isn't valid (or was already used)." }, { status: 400 });
  }

  const existing = await c.execute({ sql: "SELECT id FROM users WHERE username = ?", args: [username] });
  if (existing.rows.length > 0) return NextResponse.json({ error: "That username is taken." }, { status: 400 });

  const id = `U${randomBytes(8).toString("hex")}`;
  const { salt, hash } = hashPassphrase(passphrase);
  const recoveryCode = makeRecoveryCode();
  const rec = hashPassphrase(recoveryCode);
  const now = new Date().toISOString();

  const stmts = [
    {
      sql: "INSERT INTO users (id, username, display_name, pass_salt, pass_hash, share_group, created_at, recovery_salt, recovery_hash) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)",
      args: [id, username, displayName, salt, hash, now, rec.salt, rec.hash],
    },
  ];
  if (invite) stmts.push({ sql: "UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?", args: [id, now, invite] });
  await c.batch(stmts, "write");

  await setSessionCookie({ id, username, displayName });
  return NextResponse.json({ ok: true, user: { username, displayName }, recoveryCode });
}
