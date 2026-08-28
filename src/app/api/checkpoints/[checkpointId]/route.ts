import { NextResponse } from "next/server";

import { readRequestActor } from "@/server/auth/request-actor";
import { serviceResponse } from "@/server/http/service-response";
import { getCheckpointService } from "@/server/projects/runtime";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ checkpointId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { checkpointId } = await context.params;
    return serviceResponse(await getCheckpointService().readCheckpoint({
      checkpointId,
      walletAddress: actor.walletAddress,
    }));
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
