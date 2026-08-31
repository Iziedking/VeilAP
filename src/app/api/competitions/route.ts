import { NextResponse } from "next/server";

import { serviceResponse } from "@/server/http/service-response";
import { getArenaSeasonService } from "@/server/projects/runtime";

export const runtime = "nodejs";

export async function GET() {
  try {
    return serviceResponse(await getArenaSeasonService().listAllPublicSeasons());
  } catch {
    return NextResponse.json({ ok: false, code: "PERSISTENCE_FAILED" }, { status: 503 });
  }
}
