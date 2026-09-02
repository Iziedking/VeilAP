import { serviceResponse } from "@/server/http/service-response";
import { readRequestActor } from "@/server/auth/request-actor";
import { getArenaMatchService } from "@/server/projects/runtime";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string; seasonId: string; scheduledMatchId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId, seasonId, scheduledMatchId } = await context.params;
    return serviceResponse(await getArenaMatchService().getPrivateMatch({
      projectId,
      seasonId,
      scheduledMatchId,
      actorWalletAddress: actor.walletAddress,
    }));
  } catch {
    return serviceResponse({ ok: false, code: "ARENA_MATCH_NOT_FOUND" });
  }
}
