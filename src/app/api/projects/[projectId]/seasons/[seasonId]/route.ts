import { NextResponse } from "next/server";

import { serviceResponse } from "@/server/http/service-response";
import { getArenaSeasonService } from "@/server/projects/runtime";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; seasonId: string }> },
) {
  try {
    const { projectId, seasonId } = await context.params;
    return serviceResponse(await getArenaSeasonService().getPublicSchedule(projectId, seasonId));
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
