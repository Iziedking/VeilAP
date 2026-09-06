import { NextResponse } from "next/server";

import { readRequestActor } from "@/server/auth/request-actor";
import { serviceResponse } from "@/server/http/service-response";
import { getArenaSeasonService } from "@/server/projects/runtime";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const url = new URL(request.url);
    const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
    const pageSize = Number.parseInt(url.searchParams.get("pageSize") ?? "4", 10);
    return serviceResponse(await getArenaSeasonService().listOwnedEntries({
      actorWalletAddress: actor.walletAddress,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 4,
    }));
  } catch {
    return NextResponse.json({ ok: false, code: "PERSISTENCE_FAILED" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
