import { NextResponse } from "next/server";
import { signupsOpen } from "@/lib/server/signup";

export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ signupsOpen: signupsOpen() });
}
