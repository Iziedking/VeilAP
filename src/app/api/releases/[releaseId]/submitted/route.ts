import { NextResponse } from "next/server";
import { z } from "zod";

import { readRequestActor } from "@/server/auth/request-actor";
import { jsonBodyErrorResponse, readJsonBody } from "@/server/http/json-body";
import { serviceResponse } from "@/server/http/service-response";
import { getReleaseService } from "@/server/projects/runtime";

export const runtime = "nodejs";

const submittedSchema = z.object({ transactionHash: z.string().trim().min(3).max(80) }).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ releaseId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { releaseId } = await context.params;
    const body = submittedSchema.parse(await readJsonBody(request));
    return serviceResponse(await getReleaseService().markSubmitted({
      releaseId,
      actorWalletAddress: actor.walletAddress,
      transactionHash: body.transactionHash,
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
