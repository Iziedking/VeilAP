import { NextResponse } from "next/server";

import { readRequestActor } from "@/server/auth/request-actor";
import { readIdempotencyKey } from "@/server/http/idempotency";
import { serviceResponse } from "@/server/http/service-response";
import { getArenaSeasonService } from "@/server/projects/runtime";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; seasonId: string; scheduledMatchId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId, seasonId, scheduledMatchId } = await context.params;
    return serviceResponse(await getArenaSeasonService().runScheduledMatch({
      projectId,
      seasonId,
      scheduledMatchId,
      actorWalletAddress: actor.walletAddress,
      idempotencyKey: readIdempotencyKey(request) ?? "",
    }));
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
