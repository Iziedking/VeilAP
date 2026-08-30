import { NextResponse } from "next/server";
import { z } from "zod";

import { readRequestActor } from "@/server/auth/request-actor";
import { readIdempotencyKey } from "@/server/http/idempotency";
import { jsonBodyErrorResponse, readJsonBody } from "@/server/http/json-body";
import { serviceResponse } from "@/server/http/service-response";
import { getArenaMatchService } from "@/server/projects/runtime";

export const runtime = "nodejs";

const requestSchema = z.object({
  leftAgentId: z.string().trim().min(1).max(80),
  rightAgentId: z.string().trim().min(1).max(80),
  hands: z.number().int().min(1).max(100),
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId } = await context.params;
    const input = requestSchema.parse(await readJsonBody(request));
    return serviceResponse(await getArenaMatchService().runMatch({
      projectId,
      actorWalletAddress: actor.walletAddress,
      leftAgentId: input.leftAgentId,
      rightAgentId: input.rightAgentId,
      hands: input.hands,
      idempotencyKey: readIdempotencyKey(request) ?? "",
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    return serviceResponse(await getArenaMatchService().getPublicArena(projectId));
  } catch (error) {
    if (error instanceof Error && error.message === "CONFIGURATION_MISSING") {
      return serviceResponse({ ok: false, code: "CONFIGURATION_MISSING" });
    }
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
