import { NextResponse } from "next/server";
import { z } from "zod";

import { readRequestActor } from "@/server/auth/request-actor";
import { jsonBodyErrorResponse, readJsonBody } from "@/server/http/json-body";
import { serviceResponse } from "@/server/http/service-response";
import { getReleaseService } from "@/server/projects/runtime";

export const runtime = "nodejs";

const releaseRequestSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
  decisionId: z.string().trim().min(1).max(120),
  kind: z.enum(["milestone", "royalty"]),
  revenueEventId: z.string().trim().min(1).max(120).optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
}).strict();

export async function POST(request: Request) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const body = releaseRequestSchema.parse(await readJsonBody(request));
    const service = getReleaseService();
    const result = body.kind === "milestone"
      ? await service.prepareMilestoneRelease({ ...body, actorWalletAddress: actor.walletAddress })
      : body.revenueEventId
        ? await service.prepareRoyaltyRelease({ ...body, revenueEventId: body.revenueEventId, actorWalletAddress: actor.walletAddress })
        : { ok: false as const, code: "INVALID_INPUT" as const };
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
