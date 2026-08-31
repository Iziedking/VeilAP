import { NextResponse } from "next/server";

import { serviceResponse } from "@/server/http/service-response";
import { getArenaMatchService } from "@/server/projects/runtime";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; matchId: string }> },
) {
  try {
    const { projectId, matchId } = await context.params;
    return serviceResponse(await getArenaMatchService().getPublicMatch(projectId, matchId));
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
