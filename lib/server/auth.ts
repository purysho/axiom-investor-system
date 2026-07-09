import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "./db";

export const SESSION_COOKIE = "axiom_session";
export const OFFLINE_COOKIE = "axiom_offline";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export function sessionSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return new TextEncoder().encode(s);

  // Fail closed. The dev fallback is committed to a public repo, so booting production
  // without a real secret would let anyone forge a session cookie for any account.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[Axiom] SESSION_SECRET is missing or too short (need 16+ chars). Refusing to start: " +
      "without it, session cookies could be forged. Set it in your host's environment and redeploy.",
    );
  }
  if (!(globalThis as Record<string, unknown>).__axiomDevSecretWarned) {
    (globalThis as Record<string, unknown>).__axiomDevSecretWarned = true;
    console.warn("[Axiom] SESSION_SECRET is not set — using the dev-only secret. Production will refuse to boot without a real one.");
  }
  return new TextEncoder().encode("axiom-dev-secret-not-for-production");
}

export function hashPassphrase(passphrase: string, salt?: string): { salt: string; hash: string } {
  const s = salt ?? randomBytes(16).toString("hex");
  const h = scryptSync(passphrase.normalize("NFKC"), s, 64, { N: 16384, r: 8, p: 1 }).toString("hex");
  return { salt: s, hash: h };
}

export function verifyPassphrase(passphrase: string, salt: string, expectedHash: string): boolean {
  const { hash } = hashPassphrase(passphrase, salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expectedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  tv?: number;
}

export async function createSessionToken(user: SessionUser, tokenVersion = 1): Promise<string> {
  return new SignJWT({ un: user.username, dn: user.displayName, tv: tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${THIRTY_DAYS}s`)
    .sign(sessionSecret());
}

export async function readSessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    if (!payload.sub) return null;
    return { id: payload.sub, username: String(payload.un ?? ""), displayName: String(payload.dn ?? ""), tv: Number(payload.tv ?? 1) };
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: SessionUser, tokenVersion = 1) {
  const token = await createSessionToken(user, tokenVersion);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
  jar.delete(OFFLINE_COOKIE);
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(OFFLINE_COOKIE);
}

/** Resolve the current session, verifying the user still exists. Null when logged out/offline. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await readSessionToken(token);
  if (!claims) return null;
  const c = await db();
  const row = await c.execute({ sql: "SELECT id, username, display_name, token_version FROM users WHERE id = ?", args: [claims.id] });
  if (row.rows.length === 0) return null;
  const r = row.rows[0];
  // A bumped token_version (passphrase change, reset, "sign out everywhere") kills old cookies.
  if (Number(r.token_version ?? 1) !== Number(claims.tv ?? 1)) return null;
  return { id: String(r.id), username: String(r.username), displayName: String(r.display_name), tv: Number(r.token_version ?? 1) };
}
