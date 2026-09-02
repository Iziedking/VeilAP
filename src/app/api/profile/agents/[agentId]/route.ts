import { NextResponse } from "next/server";

import { readRequestActor } from "@/server/auth/request-actor";
import { serviceResponse } from "@/server/http/service-response";
import { getParticipantAgentService } from "@/server/projects/runtime";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ agentId: string }> }) {
  const actor = await readRequestActor();
  if (!actor.ok) return serviceResponse(actor);
  try {
    const { agentId } = await context.params;
    const result = await getParticipantAgentService().open({
      actorWalletAddress: actor.walletAddress,
      agentId,
    });
    if (!result) return NextResponse.json({ ok: false, code: "NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return serviceResponse({ ok: true, value: result });
  } catch {
    return serviceResponse({ ok: false, code: "PERSISTENCE_FAILED" });
  }
}
