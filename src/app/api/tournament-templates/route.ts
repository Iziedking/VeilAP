import { NextResponse } from "next/server";

import { TOURNAMENT_TEMPLATES } from "@/domain/arena/tournament-rules";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    { ok: true, value: TOURNAMENT_TEMPLATES },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" } },
  );
}
