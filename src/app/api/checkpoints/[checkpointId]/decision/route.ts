import { NextResponse } from "next/server";

import { readRequestActor } from "@/server/auth/request-actor";
import { jsonBodyErrorResponse, readJsonBody } from "@/server/http/json-body";
import { serviceResponse } from "@/server/http/service-response";
import { getDecisionService } from "@/server/projects/runtime";
import { signedDecisionSchema } from "@/server/decisions/decision-service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ checkpointId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { checkpointId } = await context.params;
    const body = signedDecisionSchema.parse(await readJsonBody(request));
    if (body.checkpointId !== checkpointId) {
      return serviceResponse({ ok: false, code: "INVALID_INPUT" });
    }
    return serviceResponse(await getDecisionService().createDecision({
      actorWalletAddress: actor.walletAddress,
      request: body,
    }));
  } catch (error) {
    const bodyError = jsonBodyErrorResponse(error);
    if (bodyError) return bodyError;
    if (error instanceof Error && error.message === "CONFIGURATION_MISSING") {
      return serviceResponse({ ok: false, code: "CONFIGURATION_MISSING" });
    }
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
