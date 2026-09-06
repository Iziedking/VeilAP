import { readRequestActor } from "@/server/auth/request-actor";
import { serviceResponse } from "@/server/http/service-response";
import { getArenaMatchService } from "@/server/projects/runtime";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ projectId: string; seasonId: string; scheduledMatchId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const actor = await readRequestActor();
  if (!actor.ok) return serviceResponse(actor);
  try {
    const { projectId, seasonId, scheduledMatchId } = await context.params;
    return serviceResponse(await getArenaMatchService().getCompetitionMatch({
      projectId,
      seasonId,
      scheduledMatchId,
      actorWalletAddress: actor.walletAddress,
    }));
  } catch {
    return serviceResponse({ ok: false, code: "ARENA_MATCH_NOT_FOUND" });
  }
}
