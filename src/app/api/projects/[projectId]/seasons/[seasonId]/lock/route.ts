import { NextResponse } from "next/server";
import { z } from "zod";

import { readRequestActor } from "@/server/auth/request-actor";
import { readIdempotencyKey } from "@/server/http/idempotency";
import { serviceResponse } from "@/server/http/service-response";
import { getArenaSeasonService } from "@/server/projects/runtime";

export const runtime = "nodejs";

const requestSchema = z.object({
  hands: z.number().int().min(1).max(100),
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; seasonId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId, seasonId } = await context.params;
    const input = requestSchema.parse(await request.json());
    return serviceResponse(await getArenaSeasonService().lockSeason({
      projectId,
      seasonId,
      actorWalletAddress: actor.walletAddress,
      hands: input.hands,
      idempotencyKey: readIdempotencyKey(request) ?? "",
    }));
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
