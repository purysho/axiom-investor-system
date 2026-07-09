import { db } from "./db";
import { clientIp } from "./ratelimit";

export type AuditEvent =
  | "account.created" | "account.deleted"
  | "login.success" | "login.failed" | "login.locked"
  | "logout" | "logout.all"
  | "passphrase.changed" | "passphrase.reset"
  | "recovery.regenerated"
  | "mfa.enabled" | "mfa.disabled" | "mfa.failed" | "mfa.backup_used";

/** Append-only security trail. Never throws into the caller's path. */
export async function audit(
  event: AuditEvent,
  opts: { userId?: string | null; username?: string | null; detail?: string; req?: Request },
): Promise<void> {
  try {
    const c = await db();
    await c.execute({
      sql: "INSERT INTO audit_log (user_id, username, event, detail, ip, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [
        opts.userId ?? null,
        opts.username ?? null,
        event,
        (opts.detail ?? "").slice(0, 200),
        opts.req ? clientIp(opts.req) : "",
        (opts.req?.headers.get("user-agent") ?? "").slice(0, 160),
        new Date().toISOString(),
      ],
    });
  } catch (e) {
    console.error("[Axiom] audit write failed:", e);
  }
}

export interface AuditRow { event: string; detail: string; ip: string; userAgent: string; createdAt: string }

export async function recentAuditFor(userId: string, limit = 20): Promise<AuditRow[]> {
  const c = await db();
  const res = await c.execute({
    sql: "SELECT event, detail, ip, user_agent, created_at FROM audit_log WHERE user_id = ? ORDER BY id DESC LIMIT ?",
    args: [userId, limit],
  });
  return res.rows.map((r) => ({
    event: String(r.event),
    detail: String(r.detail ?? ""),
    ip: String(r.ip ?? ""),
    userAgent: String(r.user_agent ?? ""),
    createdAt: String(r.created_at),
  }));
}
