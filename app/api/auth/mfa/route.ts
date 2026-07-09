import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sessionSecret, setSessionCookie, verifyPassphrase } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { decryptSecret } from "@/lib/server/crypto";
import { db } from "@/lib/server/db";
import { MFA_COOKIE } from "@/lib/server/mfa-cookie";
import { clientIp, crossSite, limited } from "@/lib/server/ratelimit";
import { verifyTotp } from "@/lib/server/totp";

export const dynamic = "force-dynamic";

/** POST { code } — completes sign-in. Accepts a 6-digit TOTP or a single-use backup code. */
export async function POST(req: Request) {
  if (crossSite(req)) return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  if (limited(`mfa:${clientIp(req)}`, 10, 5 * 60_000))
    return NextResponse.json({ error: "Too many attempts — wait a few minutes." }, { status: 429 });

  const jar = await cookies();
  const challenge = jar.get(MFA_COOKIE)?.value;
  if (!challenge) return NextResponse.json({ error: "Your sign-in expired. Start again." }, { status: 401 });

  let userId: string;
  try {
    const { payload } = await jwtVerify(challenge, sessionSecret());
    if (payload.purpose !== "mfa" || !payload.sub) throw new Error("bad challenge");
    userId = payload.sub;
  } catch {
    return NextResponse.json({ error: "Your sign-in expired. Start again." }, { status: 401 });
  }

  let body: { code?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const code = (body.code ?? "").trim().toUpperCase();

  const c = await db();
  const res = await c.execute({
    sql: "SELECT id, username, display_name, token_version, totp_secret, backup_codes FROM users WHERE id = ?",
    args: [userId],
  });
  if (res.rows.length === 0) return NextResponse.json({ error: "Account not found." }, { status: 401 });
  const r = res.rows[0];
  const user = { id: String(r.id), username: String(r.username), displayName: String(r.display_name) };
  const tv = Number(r.token_version ?? 1);

  const finish = async () => {
    await setSessionCookie(user, tv);
    jar.delete(MFA_COOKIE);
  };

  if (/^\d{6}$/.test(code) && r.totp_secret) {
    let seed = "";
    try { seed = decryptSecret(String(r.totp_secret)); } catch { /* fall through */ }
    if (seed && verifyTotp(code, seed)) {
      await finish();
      await audit("login.success", { userId: user.id, username: user.username, req, detail: "2FA" });
      return NextResponse.json({ ok: true });
    }
  }

  const stored: Array<{ salt: string; hash: string }> = r.backup_codes ? JSON.parse(String(r.backup_codes)) : [];
  const idx = stored.findIndex((bc) => verifyPassphrase(code, bc.salt, bc.hash));
  if (idx !== -1) {
    stored.splice(idx, 1);
    await c.execute({ sql: "UPDATE users SET backup_codes = ? WHERE id = ?", args: [JSON.stringify(stored), user.id] });
    await finish();
    await audit("mfa.backup_used", { userId: user.id, username: user.username, req, detail: `${stored.length} remaining` });
    return NextResponse.json({ ok: true, backupUsed: true, remaining: stored.length });
  }

  await audit("mfa.failed", { userId: user.id, username: user.username, req });
  return NextResponse.json({ error: "That code isn't right. Check your authenticator, or use a backup code." }, { status: 401 });
}
