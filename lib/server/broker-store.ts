import { AlpacaBroker } from "@/lib/broker/alpaca";
import type { Broker, BrokerMode } from "@/lib/broker/types";
import { decryptSecret, encryptSecret } from "./crypto";
import { db } from "./db";

export interface BrokerConnection {
  broker: "alpaca";
  mode: BrokerMode;
  connectedAt: string;
  /** Last 4 of the key id, for display. Never the secret. */
  keyHint: string;
}

export async function saveBrokerKeys(userId: string, keyId: string, secret: string, mode: BrokerMode): Promise<void> {
  const c = await db();
  await c.execute({
    sql: "UPDATE users SET broker = 'alpaca', broker_key_id = ?, broker_secret = ?, broker_mode = ?, broker_connected_at = ? WHERE id = ?",
    args: [encryptSecret(keyId), encryptSecret(secret), mode, new Date().toISOString(), userId],
  });
}

export async function clearBrokerKeys(userId: string): Promise<void> {
  const c = await db();
  await c.execute({
    sql: "UPDATE users SET broker = NULL, broker_key_id = NULL, broker_secret = NULL, broker_connected_at = NULL WHERE id = ?",
    args: [userId],
  });
}

export async function getConnection(userId: string): Promise<BrokerConnection | null> {
  const c = await db();
  const r = (await c.execute({
    sql: "SELECT broker, broker_key_id, broker_mode, broker_connected_at FROM users WHERE id = ?",
    args: [userId],
  })).rows[0];
  if (!r?.broker || !r.broker_key_id) return null;
  let keyHint = "????";
  try { const k = decryptSecret(String(r.broker_key_id)); keyHint = k.slice(-4); } catch { /* unreadable */ }
  return {
    broker: "alpaca",
    mode: (String(r.broker_mode ?? "paper") === "live" ? "live" : "paper"),
    connectedAt: String(r.broker_connected_at ?? ""),
    keyHint,
  };
}

/** Builds a live Broker client for this user, or null when they haven't connected one. */
export async function getBroker(userId: string): Promise<Broker | null> {
  const c = await db();
  const r = (await c.execute({
    sql: "SELECT broker, broker_key_id, broker_secret, broker_mode FROM users WHERE id = ?",
    args: [userId],
  })).rows[0];
  if (!r?.broker || !r.broker_key_id || !r.broker_secret) return null;
  const keyId = decryptSecret(String(r.broker_key_id));
  const secret = decryptSecret(String(r.broker_secret));
  const mode: BrokerMode = String(r.broker_mode ?? "paper") === "live" ? "live" : "paper";
  return new AlpacaBroker(keyId, secret, mode);
}

export async function ordersToday(userId: string): Promise<number> {
  const c = await db();
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const r = await c.execute({
    sql: "SELECT COUNT(*) AS n FROM broker_orders WHERE user_id = ? AND submitted_at >= ?",
    args: [userId, since.toISOString()],
  });
  return Number(r.rows[0]?.n ?? 0);
}
