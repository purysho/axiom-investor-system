import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSessionUser, hashPassphrase } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

function makeRecoveryCode(): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const pick = () => alphabet[randomBytes(1)[0] % alphabet.length];
  const block = () => Array.from({ length: 4 }, pick).join("");
  return `AXR-${block()}-${block()}`;
}

export async function POST() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const code = makeRecoveryCode();
  const rec = hashPassphrase(code);
  const c = await db();
  await c.execute({ sql: "UPDATE users SET recovery_salt = ?, recovery_hash = ? WHERE id = ?", args: [rec.salt, rec.hash, session.id] });
  return NextResponse.json({ ok: true, recoveryCode: code });
}
