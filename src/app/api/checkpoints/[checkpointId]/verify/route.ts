import { NextResponse } from "next/server";

import { readRequestActor } from "@/server/auth/request-actor";
import { serviceResponse } from "@/server/http/service-response";
import {
  verifyCheckpointInputSchema,
} from "@/server/verification/verification-service";
import { getVerificationService } from "@/server/projects/runtime";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ checkpointId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { checkpointId } = await context.params;
    const requestBody = verifyCheckpointInputSchema.parse(await request.json());
    return serviceResponse(await getVerificationService().verifyCheckpoint({
      checkpointId,
      actorWalletAddress: actor.walletAddress,
      request: requestBody,
    }));
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
