import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { recentAuditFor } from "@/lib/server/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ events: await recentAuditFor(user.id, 20) });
}
