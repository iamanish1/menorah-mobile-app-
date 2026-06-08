import { NextResponse } from "next/server";
import { getLandingDatabase } from "@/lib/landing-mongodb";

export async function GET() {
  try {
    const db = await getLandingDatabase();
    await db.command({ ping: 1 });
    return NextResponse.json({ ok: true, database: "connected" });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Database unavailable" },
      { status: 503 }
    );
  }
}
