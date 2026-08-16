import { NextResponse } from "next/server";
import { getDatabase } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = await getDatabase();
    await database.command({ ping: 1 });
    return NextResponse.json(
      { status: "ready" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "not-ready" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
