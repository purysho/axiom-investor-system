import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Authenticated encryption for secrets we must store but never want readable in a
 * database dump (currently TOTP seeds; broker API keys later).
 *
 * Key source: ENCRYPTION_KEY (64 hex chars) if set, otherwise derived from
 * SESSION_SECRET so a correctly-configured deployment needs no extra variable.
 * Rotating SESSION_SECRET therefore invalidates stored TOTP seeds — documented.
 */
let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (cachedKey) return cachedKey;
  const explicit = process.env.ENCRYPTION_KEY;
  if (explicit) {
    if (!/^[0-9a-fA-F]{64}$/.test(explicit)) throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes).");
    cachedKey = Buffer.from(explicit, "hex");
    return cachedKey;
  }
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("Cannot derive an encryption key: set SESSION_SECRET (or ENCRYPTION_KEY).");
  cachedKey = scryptSync(s, "axiom-enc-v1", 32);
  return cachedKey;
}

/** → "v1.<iv>.<tag>.<ciphertext>", all base64url. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, ct] = blob.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Malformed ciphertext.");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}
