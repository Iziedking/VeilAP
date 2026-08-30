import { NextResponse } from "next/server";
import { z } from "zod";

import { readRequestActor } from "@/server/auth/request-actor";
import { JsonBodyError, readJsonBody } from "@/server/http/json-body";
import { serviceResponse } from "@/server/http/service-response";
import { getArenaEnrollmentService } from "@/server/projects/runtime";

export const runtime = "nodejs";

const requestSchema = z.object({
  agentId: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9][A-Za-z0-9_-]+$/),
  policy: z.unknown(),
}).strict();

type JoinRouteContext = {
  params: Promise<{ projectId: string; seasonId: string }>;
};

export async function POST(request: Request, context: JoinRouteContext) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey) return serviceResponse({ ok: false, code: "INVALID_INPUT" });
    const { projectId, seasonId } = await context.params;
    const input = requestSchema.parse(await readJsonBody(request));
    return serviceResponse(await getArenaEnrollmentService().enroll({
      projectId,
      seasonId,
      actorWalletAddress: actor.walletAddress,
      agentId: input.agentId,
      policy: input.policy,
      idempotencyKey,
    }));
  } catch (error) {
    if (error instanceof JsonBodyError) {
      return NextResponse.json({ ok: false, code: error.code }, {
        status: error.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (error instanceof Error && error.message === "CONFIGURATION_MISSING") {
      return serviceResponse({ ok: false, code: "CONFIGURATION_MISSING" });
    }
    return serviceResponse({ ok: false, code: "INVALID_INPUT" });
  }
}

export async function GET(_request: Request, context: JoinRouteContext) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId, seasonId } = await context.params;
    return serviceResponse(await getArenaEnrollmentService().getMyEntry({
      projectId,
      seasonId,
      actorWalletAddress: actor.walletAddress,
    }));
  } catch {
    return serviceResponse({ ok: false, code: "INVALID_INPUT" });
  }
}
