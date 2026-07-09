import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSessionUser } from "@/lib/server/auth";
import { encryptSecret } from "@/lib/server/crypto";
import { db } from "@/lib/server/db";
import { generateTotpSecret, otpauthUri } from "@/lib/server/totp";

export const dynamic = "force-dynamic";

/** POST → mints a pending TOTP seed and returns a QR code. Not active until /enable verifies a code. */
export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const c = await db();
  const cur = await c.execute({ sql: "SELECT totp_enabled FROM users WHERE id = ?", args: [user.id] });
  if (Number(cur.rows[0]?.totp_enabled ?? 0) === 1)
    return NextResponse.json({ error: "Two-factor is already on. Turn it off first to re-enrol." }, { status: 400 });

  const seed = generateTotpSecret();
  const uri = otpauthUri(seed, user.username);
  await c.execute({ sql: "UPDATE users SET totp_secret = ? WHERE id = ?", args: [encryptSecret(seed), user.id] });

  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220, color: { dark: "#0B0F0D", light: "#EFF6F1" } });
  return NextResponse.json({ ok: true, secret: seed, qrDataUrl });
}
