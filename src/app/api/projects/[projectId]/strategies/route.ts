import { NextResponse } from "next/server";
import { z } from "zod";

import { readRequestActor } from "@/server/auth/request-actor";
import { getStrategyService } from "@/server/projects/runtime";
import { serviceResponse } from "@/server/http/service-response";

export const runtime = "nodejs";

const requestSchema = z.object({
  agentId: z.string().trim().min(1).max(80),
  policy: z.unknown(),
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId } = await context.params;
    const input = requestSchema.parse(await request.json());
    return serviceResponse(await getStrategyService().submitStrategy({
      projectId,
      actorWalletAddress: actor.walletAddress,
      agentId: input.agentId,
      policy: input.policy,
    }));
  } catch (error) {
    if (error instanceof Error && error.message === "CONFIGURATION_MISSING") {
      return serviceResponse({ ok: false, code: "CONFIGURATION_MISSING" });
    }
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
