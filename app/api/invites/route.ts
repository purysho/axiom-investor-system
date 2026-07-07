import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSessionUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const c = await db();
  const res = await c.execute("SELECT code, note, created_at FROM invites WHERE used_by IS NULL ORDER BY created_at DESC");
  return NextResponse.json({
    invites: res.rows.map((r) => ({ code: String(r.code), note: String(r.note), createdAt: String(r.created_at) })),
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let note = "";
  try {
    const body = await req.json();
    note = String(body.note ?? "").slice(0, 60);
  } catch {
    /* note optional */
  }
  const c = await db();
  const code = `AXIOM-${randomBytes(4).toString("hex").toUpperCase()}`;
  await c.execute({
    sql: "INSERT INTO invites (code, note, created_at) VALUES (?, ?, ?)",
    args: [code, note || `by ${user.username}`, new Date().toISOString()],
  });
  return NextResponse.json({ code });
}
