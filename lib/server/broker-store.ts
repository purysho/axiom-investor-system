import { AlpacaBroker } from "@/lib/broker/alpaca";
import { SimBroker, SIM_INITIAL_EQUITY } from "@/lib/broker/sim";
import type { Broker, BrokerId, BrokerMode } from "@/lib/broker/types";
import { decryptSecret, encryptSecret } from "./crypto";
import { db } from "./db";

export interface BrokerConnection {
  broker: BrokerId;
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

/** Connect the built-in simulator (no external API keys required). */
export async function connectSim(userId: string): Promise<void> {
  const c = await db();
  const now = new Date().toISOString();
  await c.execute({
    sql: "UPDATE users SET broker = 'sim', broker_key_id = NULL, broker_secret = NULL, broker_mode = 'paper', broker_connected_at = ? WHERE id = ?",
    args: [now, userId],
  });
  // Reset the sim account to a clean slate.
  await c.execute({
    sql: `INSERT INTO sim_accounts (user_id, initial_equity, cash, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET initial_equity = excluded.initial_equity, cash = excluded.cash, updated_at = excluded.updated_at`,
    args: [userId, SIM_INITIAL_EQUITY, SIM_INITIAL_EQUITY, now, now],
  });
  await c.execute({ sql: "DELETE FROM sim_positions WHERE user_id = ?", args: [userId] });
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
  if (!r?.broker) return null;

  if (String(r.broker) === "sim") {
    return {
      broker: "sim",
      mode: "paper",
      connectedAt: String(r.broker_connected_at ?? ""),
      keyHint: "",
    };
  }

  if (!r.broker_key_id) return null;
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
  if (!r?.broker) return null;
  if (String(r.broker) === "sim") return new SimBroker(userId);
  if (!r.broker_key_id || !r.broker_secret) return null;
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
