import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { cookies } from "next/headers";
import { sessionSecret, setSessionCookie, verifyPassphrase } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { clearFailures, lockRemaining, noteFailure } from "@/lib/server/lockout";
import { clientIp, crossSite, limited } from "@/lib/server/ratelimit";
import { MFA_COOKIE } from "@/lib/server/mfa-cookie";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (crossSite(req)) return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
  if (limited(`login:${clientIp(req)}`, 6, 5 * 60_000))
    return NextResponse.json({ error: "Too many sign-in attempts — try again in a few minutes." }, { status: 429 });

  let body: { username?: string; passphrase?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const username = (body.username ?? "").trim().toLowerCase();
  const passphrase = body.passphrase ?? "";

  const locked = await lockRemaining(username);
  if (locked > 0) {
    await audit("login.locked", { username, req, detail: `${locked}s remaining` });
    return NextResponse.json({ error: `Account temporarily locked after repeated failures. Try again in ${Math.ceil(locked / 60)} minute(s).` }, { status: 429 });
  }

  const c = await db();
  const res = await c.execute({
    sql: "SELECT id, username, display_name, pass_salt, pass_hash, token_version, totp_enabled FROM users WHERE username = ?",
    args: [username],
  });

  // Same response and roughly the same work whether or not the username exists.
  const generic = () => NextResponse.json({ error: "Wrong username or passphrase." }, { status: 401 });
  if (res.rows.length === 0) {
    verifyPassphrase(passphrase, "0".repeat(32), "0".repeat(128)); // constant-ish time
    await audit("login.failed", { username, req, detail: "no such user" });
    return generic();
  }

  const r = res.rows[0];
  if (!verifyPassphrase(passphrase, String(r.pass_salt), String(r.pass_hash))) {
    const nowLocked = await noteFailure(username);
    await audit(nowLocked ? "login.locked" : "login.failed", { userId: String(r.id), username, req, detail: nowLocked ? "threshold reached" : "bad passphrase" });
    return generic();
  }

  await clearFailures(username);
  const user = { id: String(r.id), username: String(r.username), displayName: String(r.display_name) };
  const tv = Number(r.token_version ?? 1);

  // 2FA on → issue a short-lived challenge cookie instead of a session.
  if (Number(r.totp_enabled ?? 0) === 1) {
    const challenge = await new SignJWT({ purpose: "mfa" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(sessionSecret());
    const jar = await cookies();
    jar.set(MFA_COOKIE, challenge, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 300,
    });
    return NextResponse.json({ ok: true, mfaRequired: true });
  }

  await setSessionCookie(user, tv);
  await audit("login.success", { userId: user.id, username, req });
  return NextResponse.json({ ok: true });
}
