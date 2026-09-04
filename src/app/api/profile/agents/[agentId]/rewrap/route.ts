import { readRequestActor } from "@/server/auth/request-actor";
import { getParticipantAgentService } from "@/server/projects/runtime";
import { serviceResponse } from "@/server/http/service-response";

export const runtime = "nodejs";
// Next 16.3.3 installed route.md: dynamic params are a promise (2026-09-04).
export async function POST(_request: Request, context: { params: Promise<{ agentId: string }> }) {
  const actor = await readRequestActor();
  if (!actor.ok) return serviceResponse(actor);
  const { agentId } = await context.params;
  try {
    return serviceResponse({ ok: true, value: await getParticipantAgentService().rewrap({ actorWalletAddress: actor.walletAddress, agentId }) });
  } catch (error) {
    const code = error instanceof Error && error.message === "PARTICIPANT_AGENT_NOT_FOUND" ? "STRATEGY_ARTIFACT_NOT_FOUND" : "ENCRYPTION_FAILED";
    return serviceResponse({ ok: false, code });
  }
}
