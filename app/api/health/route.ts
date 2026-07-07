import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";

/**
 * Public liveness + readiness probe. Touching db() here also triggers the
 * first-run bootstrap (schema + printed invite code) on a fresh database,
 * which matters on serverless hosts where no long-lived process exists.
 */
export async function GET() {
  try {
    await db();
    return NextResponse.json({
      ok: true,
      app: "axiom-investor-system",
      storage: process.env.TURSO_DATABASE_URL ? "turso" : "sqlite-file",
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
