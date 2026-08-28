import { NextResponse } from "next/server";

import { readRequestActor } from "@/server/auth/request-actor";
import { serviceResponse } from "@/server/http/service-response";
import { getReconciliationService } from "@/server/projects/runtime";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ releaseId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { releaseId } = await context.params;
    return serviceResponse(await getReconciliationService().reconcile({
      releaseId,
      actorWalletAddress: actor.walletAddress,
    }));
  } catch (error) {
    if (error instanceof Error && (error.message === "CONFIGURATION_MISSING" || error.message === "STRK20_POOL_NOT_CONFIGURED")) {
      return serviceResponse({ ok: false, code: "CONFIGURATION_MISSING" });
    }
    return NextResponse.json({ ok: false, code: "PERSISTENCE_FAILED" }, { status: 503 });
  }
}
