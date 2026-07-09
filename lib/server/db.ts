import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { randomBytes } from "node:crypto";

/**
 * One data layer, two homes:
 *  - TURSO_DATABASE_URL set → hosted libSQL (Vercel-friendly, serverless-safe)
 *  - otherwise → a local SQLite file under DATA_DIR (Docker/VPS with a volume)
 */
let client: Client | null = null;
let ready: Promise<void> | null = null;

function makeClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) {
    return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  const dir = process.env.DATA_DIR || "./data";
  mkdirSync(dir, { recursive: true });
  return createClient({ url: `file:${dir}/axiom.db` });
}

async function ensureSchema(c: Client) {
  await c.batch(
    [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        pass_salt TEXT NOT NULL,
        pass_hash TEXT NOT NULL,
        share_group INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS invites (
        code TEXT PRIMARY KEY,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        used_by TEXT,
        used_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS states (
        user_id TEXT PRIMARY KEY REFERENCES users(id),
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ],
    "write",
  );
  await migrate(c);
}

async function migrate(c: Client) {
  // Idempotent column adds for databases created before recovery codes existed.
  for (const sql of [
    "ALTER TABLE users ADD COLUMN recovery_salt TEXT",
    "ALTER TABLE users ADD COLUMN recovery_hash TEXT",
    "ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1",
    "ALTER TABLE users ADD COLUMN totp_secret TEXT",
    "ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN backup_codes TEXT",
    "ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE users ADD COLUMN locked_until TEXT",
    "ALTER TABLE users ADD COLUMN broker TEXT",
    "ALTER TABLE users ADD COLUMN broker_key_id TEXT",
    "ALTER TABLE users ADD COLUMN broker_secret TEXT",
    "ALTER TABLE users ADD COLUMN broker_mode TEXT NOT NULL DEFAULT 'paper'",
    "ALTER TABLE users ADD COLUMN broker_connected_at TEXT",
  ]) {
    try { await c.execute(sql); } catch { /* column already exists */ }
  }
  await c.execute(
    `CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      username TEXT,
      event TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`,
  );
  try { await c.execute("CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log (user_id, created_at DESC)"); } catch { /* ok */ }

  // Every order Axiom submits, recorded before it is sent. The broker is the source of
  // truth for fills; this table is the source of truth for intent and idempotency.
  await c.execute(
    `CREATE TABLE IF NOT EXISTS broker_orders (
      client_order_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      recommendation_id TEXT,
      broker TEXT NOT NULL,
      mode TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      qty REAL NOT NULL,
      entry REAL,
      stop REAL,
      take_profit REAL,
      broker_order_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      filled_qty REAL NOT NULL DEFAULT 0,
      filled_avg_price REAL,
      submitted_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      error TEXT
    )`,
  );
  try { await c.execute("CREATE INDEX IF NOT EXISTS idx_orders_user ON broker_orders (user_id, submitted_at DESC)"); } catch { /* ok */ }
}

/** First run on an empty database: mint one invite and print it to the server log. */
async function ensureBootstrapInvite(c: Client) {
  const users = await c.execute("SELECT COUNT(*) AS n FROM users");
  const invites = await c.execute("SELECT COUNT(*) AS n FROM invites");
  if (Number(users.rows[0].n) === 0 && Number(invites.rows[0].n) === 0) {
    const code = `AXIOM-${randomBytes(4).toString("hex").toUpperCase()}`;
    await c.execute({
      sql: "INSERT INTO invites (code, note, created_at) VALUES (?, ?, ?)",
      args: [code, "bootstrap", new Date().toISOString()],
    });
    console.log(`\n[Axiom] First run — your invite code is: ${code}\n[Axiom] Open /join and use it to create the first account.\n`);
  }
}

export async function db(): Promise<Client> {
  if (!client) client = makeClient();
  if (!ready) ready = ensureSchema(client).then(() => ensureBootstrapInvite(client!));
  await ready;
  return client;
}
