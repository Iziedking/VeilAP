import { NextResponse } from "next/server";

import { readRequestActor } from "@/server/auth/request-actor";
import { serviceResponse } from "@/server/http/service-response";
import { createCheckpointInputSchema } from "@/server/checkpoints/checkpoint-service";
import { getCheckpointService } from "@/server/projects/runtime";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId } = await context.params;
    return serviceResponse(await getCheckpointService().listCheckpoints({
      projectId,
      walletAddress: actor.walletAddress,
    }));
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId } = await context.params;
    const checkpoint = createCheckpointInputSchema.parse(await request.json());
    return serviceResponse(await getCheckpointService().submitCheckpoint({
      projectId,
      actorWalletAddress: actor.walletAddress,
      checkpoint,
    }));
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
