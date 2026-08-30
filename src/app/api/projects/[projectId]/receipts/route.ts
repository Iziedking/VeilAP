import { NextResponse } from "next/server";

import { readRequestActor } from "@/server/auth/request-actor";
import { issueReceiptRequestSchema } from "@/server/receipts/schemas";
import { jsonBodyErrorResponse, readJsonBody } from "@/server/http/json-body";
import { serviceResponse } from "@/server/http/service-response";
import { getReceiptService } from "@/server/projects/runtime";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId } = await context.params;
    const body = issueReceiptRequestSchema.parse(await readJsonBody(request));
    const result = await getReceiptService().issue({
      projectId,
      releaseId: body.releaseId,
      audience: body.audience,
      actorWalletAddress: actor.walletAddress,
    });
    return serviceResponse(result);
  } catch (error) {
    const bodyError = jsonBodyErrorResponse(error);
    if (bodyError) return bodyError;
    if (error instanceof Error && error.message === "CONFIGURATION_MISSING") {
      return serviceResponse({ ok: false, code: "CONFIGURATION_MISSING" });
    }
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
