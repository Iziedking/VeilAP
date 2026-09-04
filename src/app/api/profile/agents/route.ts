import { readRequestActor } from "@/server/auth/request-actor";
import { serviceResponse } from "@/server/http/service-response";
import { jsonBodyErrorResponse, readJsonBody } from "@/server/http/json-body";
import { getParticipantAgentService } from "@/server/projects/runtime";

export const runtime = "nodejs";

export async function GET() {
  const actor = await readRequestActor();
  if (!actor.ok) return serviceResponse(actor);
  try {
    return serviceResponse({ ok: true, value: await getParticipantAgentService().list(actor.walletAddress) });
  } catch {
    return serviceResponse({ ok: false, code: "PERSISTENCE_FAILED" });
  }
}

export async function POST(request: Request) {
  const actor = await readRequestActor();
  if (!actor.ok) return serviceResponse(actor);
  try {
    const body = await readJsonBody(request, 64 * 1024) as { agentPackage?: unknown };
    if (!body || typeof body !== "object" || !("agentPackage" in body)) {
      return serviceResponse({ ok: false, code: "INVALID_INPUT" });
    }
    return serviceResponse({ ok: true, value: await getParticipantAgentService().save({
      actorWalletAddress: actor.walletAddress,
      agentPackage: body.agentPackage,
    }) });
  } catch (error) {
    const bodyError = jsonBodyErrorResponse(error);
    if (bodyError) return bodyError;
    const code = error instanceof Error && error.message === "AGENT_PACKAGE_INVALID" ? "INVALID_INPUT"
      : error instanceof Error && error.message.startsWith("PARTICIPANT_VAULT_KEY_") ? "CONFIGURATION_MISSING" : "PERSISTENCE_FAILED";
    return serviceResponse({ ok: false, code });
  }
}
