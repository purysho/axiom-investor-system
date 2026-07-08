import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { hashPassphrase, verifyPassphrase } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { clientIp, limited } from "@/lib/server/ratelimit";

export const dynamic = "force-dynamic";

function makeRecoveryCode(): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const pick = () => alphabet[randomBytes(1)[0] % alphabet.length];
  const block = () => Array.from({ length: 4 }, pick).join("");
  return `AXR-${block()}-${block()}`;
}

export async function POST(req: Request) {
  if (limited(`reset:${clientIp(req)}`, 5, 15 * 60_000))
    return NextResponse.json({ error: "Too many attempts — try again in 15 minutes." }, { status: 429 });

  let body: { username?: string; recoveryCode?: string; newPassphrase?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const username = (body.username ?? "").trim().toLowerCase();
  const code = (body.recoveryCode ?? "").trim().toUpperCase();
  const next = body.newPassphrase ?? "";
  if (!username || !code) return NextResponse.json({ error: "Username and recovery code are required." }, { status: 400 });
  if (next.length < 8) return NextResponse.json({ error: "New passphrase must be at least 8 characters." }, { status: 400 });

  const c = await db();
  const res = await c.execute({ sql: "SELECT id, recovery_salt, recovery_hash FROM users WHERE username = ?", args: [username] });
  const row = res.rows[0];
  const fail = () => NextResponse.json({ error: "That username + recovery code combination doesn't match." }, { status: 400 });
  if (!row || !row.recovery_salt || !row.recovery_hash) return fail();
  if (!verifyPassphrase(code, String(row.recovery_salt), String(row.recovery_hash))) return fail();

  const { salt, hash } = hashPassphrase(next);
  const fresh = makeRecoveryCode();
  const rec = hashPassphrase(fresh);
  await c.execute({
    sql: "UPDATE users SET pass_salt = ?, pass_hash = ?, recovery_salt = ?, recovery_hash = ? WHERE id = ?",
    args: [salt, hash, rec.salt, rec.hash, row.id],
  });
  return NextResponse.json({ ok: true, recoveryCode: fresh });
}
