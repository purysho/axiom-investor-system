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
  ]) {
    try { await c.execute(sql); } catch { /* column already exists */ }
  }
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
