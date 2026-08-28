import { NextResponse } from "next/server";

import { readRequestActor } from "@/server/auth/request-actor";
import { serviceResponse } from "@/server/http/service-response";
import { getReleaseService } from "@/server/projects/runtime";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ releaseId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { releaseId } = await context.params;
    return serviceResponse(await getReleaseService().markWalletPrompted({
      releaseId,
      actorWalletAddress: actor.walletAddress,
    }));
  } catch (error) {
    if (error instanceof Error && error.message === "CONFIGURATION_MISSING") {
      return serviceResponse({ ok: false, code: "CONFIGURATION_MISSING" });
    }
    return NextResponse.json({ ok: false, code: "RELEASE_NOT_FOUND" }, { status: 404 });
  }
}
