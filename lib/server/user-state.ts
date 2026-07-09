import type { AppState } from "@/lib/engine/types";
import { db } from "./db";

/**
 * The user's synced Axiom state, read server-side. Lets the order route enforce
 * protections and the gate against real data rather than trusting the client's
 * claim about them.
 */
export async function loadUserState(userId: string): Promise<AppState | null> {
  const c = await db();
  const r = (await c.execute({ sql: "SELECT data FROM states WHERE user_id = ?", args: [userId] })).rows[0];
  if (!r?.data) return null;
  try { return JSON.parse(String(r.data)) as AppState; } catch { return null; }
}
