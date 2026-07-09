import { db } from "./db";

const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

/** Returns remaining lock seconds, or 0 when the account is usable. DB-backed, so it survives restarts. */
export async function lockRemaining(username: string): Promise<number> {
  const c = await db();
  const res = await c.execute({ sql: "SELECT locked_until FROM users WHERE username = ?", args: [username] });
  const until = res.rows[0]?.locked_until;
  if (!until) return 0;
  const ms = new Date(String(until)).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 1000) : 0;
}

/** Records a failure; locks the account once the threshold is crossed. Returns true when now locked. */
export async function noteFailure(username: string): Promise<boolean> {
  const c = await db();
  const res = await c.execute({ sql: "SELECT failed_attempts FROM users WHERE username = ?", args: [username] });
  if (res.rows.length === 0) return false; // unknown username — nothing to lock
  const next = Number(res.rows[0].failed_attempts ?? 0) + 1;
  if (next >= MAX_FAILED) {
    const until = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
    await c.execute({ sql: "UPDATE users SET failed_attempts = 0, locked_until = ? WHERE username = ?", args: [until, username] });
    return true;
  }
  await c.execute({ sql: "UPDATE users SET failed_attempts = ? WHERE username = ?", args: [next, username] });
  return false;
}

export async function clearFailures(username: string): Promise<void> {
  const c = await db();
  await c.execute({ sql: "UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE username = ?", args: [username] });
}
