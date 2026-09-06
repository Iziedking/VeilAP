import { NextResponse } from "next/server";

import { serviceResponse } from "@/server/http/service-response";
import { getArenaSeasonService } from "@/server/projects/runtime";
import { readRequestActor } from "@/server/auth/request-actor";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; seasonId: string }> },
) {
  try {
    const { projectId, seasonId } = await context.params;
    const actor = await readRequestActor();
    return serviceResponse(await getArenaSeasonService().getScheduleForViewer({
      projectId,
      seasonId,
      ...(actor.ok ? { actorWalletAddress: actor.walletAddress } : {}),
    }));
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
