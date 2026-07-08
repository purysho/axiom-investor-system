import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { evaluateGate } from "@/lib/engine/gate";
import { journalStats } from "@/lib/engine/stats";
import type { AppState } from "@/lib/engine/types";

interface MemberRow {
  displayName: string;
  username: string;
  isYou: boolean;
  shared: boolean;
  snapshot: null | {
    gateState: string;
    adherencePct: number | null;
    expectancyR: number | null;
    closedCount: number;
    openCount: number;
    lastCheck: string | null;
    updatedAt: string;
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const c = await db();
  const res = await c.execute(
    `SELECT u.id, u.username, u.display_name, u.share_group, s.data, s.updated_at
     FROM users u LEFT JOIN states s ON s.user_id = u.id
     ORDER BY u.created_at ASC`,
  );

  const visible = res.rows.filter((r) => Number(r.share_group) === 1 || String(r.id) === user?.id);
  const members: MemberRow[] = visible.map((r) => {
    const shared = Number(r.share_group) === 1;
    const base: MemberRow = {
      displayName: String(r.display_name),
      username: String(r.username),
      isYou: String(r.id) === user.id,
      shared,
      snapshot: null,
    };
    if (!shared || !r.data) return base;
    try {
      const state = JSON.parse(String(r.data)) as AppState;
      const gate = evaluateGate(state.gateInputs, state.settings, state.trades ?? []);
      const js = journalStats(state.trades ?? []);
      const days = Object.keys(state.dailyChecks ?? {}).sort();
      base.snapshot = {
        gateState: gate.state,
        adherencePct: js.adherencePct,
        expectancyR: js.expectancyR,
        closedCount: js.closedCount,
        openCount: js.openCount,
        lastCheck: days.length ? days[days.length - 1] : null,
        updatedAt: String(r.updated_at),
      };
    } catch {
      // Unreadable state → show membership without numbers.
    }
    return base;
  });

  return NextResponse.json({ members });
}
