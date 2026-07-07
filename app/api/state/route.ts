import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

const MAX_BYTES = 2_000_000;

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const c = await db();
  const res = await c.execute({ sql: "SELECT data, updated_at FROM states WHERE user_id = ?", args: [user.id] });
  if (res.rows.length === 0) return NextResponse.json({ data: null, updatedAt: null, user });
  return NextResponse.json({
    data: JSON.parse(String(res.rows[0].data)),
    updatedAt: String(res.rows[0].updated_at),
    user,
  });
}

export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const text = await req.text();
  if (text.length > MAX_BYTES)
    return NextResponse.json({ error: "State too large to sync — export a backup and prune." }, { status: 413 });

  let body: { data?: unknown; baseUpdatedAt?: string | null; force?: boolean };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.data || typeof body.data !== "object")
    return NextResponse.json({ error: "Missing state data." }, { status: 400 });

  const c = await db();
  const current = await c.execute({ sql: "SELECT data, updated_at FROM states WHERE user_id = ?", args: [user.id] });
  const serverUpdatedAt = current.rows.length ? String(current.rows[0].updated_at) : null;

  // Another device wrote since this client last read → hand back the server copy.
  if (!body.force && serverUpdatedAt && body.baseUpdatedAt !== serverUpdatedAt) {
    return NextResponse.json(
      { conflict: true, data: JSON.parse(String(current.rows[0].data)), updatedAt: serverUpdatedAt },
      { status: 409 },
    );
  }

  const updatedAt = new Date().toISOString();
  await c.execute({
    sql: `INSERT INTO states (user_id, data, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    args: [user.id, JSON.stringify(body.data), updatedAt],
  });
  return NextResponse.json({ ok: true, updatedAt });
}
