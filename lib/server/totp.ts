import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * RFC 6238 TOTP (SHA-1, 6 digits, 30s step) on node:crypto — no third-party
 * dependency in the authentication path. Compatible with Google Authenticator,
 * 1Password, Authy, etc.
 */
const STEP = 30;
const DIGITS = 6;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error("Invalid base32 character.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** 20 random bytes → 32-char base32 seed. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function codeFor(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** Verify with a ±1 step window to tolerate clock drift. */
export function verifyTotp(token: string, secretB32: string, now = Date.now()): boolean {
  const t = (token ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(t)) return false;
  let secret: Buffer;
  try { secret = base32Decode(secretB32); } catch { return false; }
  const counter = Math.floor(now / 1000 / STEP);
  for (const c of [counter - 1, counter, counter + 1]) {
    const expected = Buffer.from(codeFor(secret, c));
    const given = Buffer.from(t);
    if (expected.length === given.length && timingSafeEqual(expected, given)) return true;
  }
  return false;
}

export function otpauthUri(secretB32: string, username: string, issuer = "AXIOM"): string {
  const label = encodeURIComponent(`${issuer}:${username}`);
  const params = new URLSearchParams({ secret: secretB32, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(STEP) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Single-use 2FA backup codes, format XXXX-XXXX. */
export function generateBackupCodes(n = 8): string[] {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const pick = () => alphabet[randomBytes(1)[0] % alphabet.length];
  const block = () => Array.from({ length: 4 }, pick).join("");
  return Array.from({ length: n }, () => `${block()}-${block()}`);
}
