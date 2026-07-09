import { NextResponse } from "next/server";
import { getSessionUser, hashPassphrase } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { decryptSecret } from "@/lib/server/crypto";
import { db } from "@/lib/server/db";
import { generateBackupCodes, verifyTotp } from "@/lib/server/totp";

export const dynamic = "force-dynamic";

/** POST { code } → verifies the pending seed, switches 2FA on, returns backup codes once. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { code?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const c = await db();
  const res = await c.execute({ sql: "SELECT totp_secret FROM users WHERE id = ?", args: [user.id] });
  const enc = res.rows[0]?.totp_secret;
  if (!enc) return NextResponse.json({ error: "Start the setup first." }, { status: 400 });

  let seed: string;
  try { seed = decryptSecret(String(enc)); } catch { return NextResponse.json({ error: "Setup data unreadable — start again." }, { status: 400 }); }
  if (!verifyTotp((body.code ?? "").trim(), seed))
    return NextResponse.json({ error: "That code isn't right. Check your phone's clock and try the current code." }, { status: 400 });

  const codes = generateBackupCodes(8);
  const hashed = codes.map((code) => hashPassphrase(code));
  await c.execute({
    sql: "UPDATE users SET totp_enabled = 1, backup_codes = ? WHERE id = ?",
    args: [JSON.stringify(hashed), user.id],
  });
  await audit("mfa.enabled", { userId: user.id, username: user.username, req });
  return NextResponse.json({ ok: true, backupCodes: codes });
}
