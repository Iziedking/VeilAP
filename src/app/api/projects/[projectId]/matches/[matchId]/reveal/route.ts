import { NextResponse } from "next/server";
import { z } from "zod";

import { readRequestActor } from "@/server/auth/request-actor";
import { readIdempotencyKey } from "@/server/http/idempotency";
import { serviceResponse } from "@/server/http/service-response";
import { getArenaMatchService } from "@/server/projects/runtime";

export const runtime = "nodejs";

const requestSchema = z.object({
  handIndex: z.number().int().min(1),
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; matchId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId, matchId } = await context.params;
    const input = requestSchema.parse(await request.json());
    return serviceResponse(await getArenaMatchService().revealLosingAction({
      projectId,
      actorWalletAddress: actor.walletAddress,
      matchId,
      handIndex: input.handIndex,
      idempotencyKey: readIdempotencyKey(request) ?? "",
    }));
  } catch (error) {
    if (error instanceof Error && error.message === "CONFIGURATION_MISSING") {
      return serviceResponse({ ok: false, code: "CONFIGURATION_MISSING" });
    }
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
