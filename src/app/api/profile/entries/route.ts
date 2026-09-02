import { NextResponse } from "next/server";

import { readRequestActor } from "@/server/auth/request-actor";
import { serviceResponse } from "@/server/http/service-response";
import { getArenaSeasonService } from "@/server/projects/runtime";

export const runtime = "nodejs";

export async function GET() {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    return serviceResponse(await getArenaSeasonService().listOwnedEntries({
      actorWalletAddress: actor.walletAddress,
    }));
  } catch {
    return NextResponse.json({ ok: false, code: "PERSISTENCE_FAILED" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
