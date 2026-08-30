import { NextResponse } from "next/server";

import { serviceResponse } from "@/server/http/service-response";
import { readRequestActor } from "@/server/auth/request-actor";

export const runtime = "nodejs";

export async function GET() {
  const actor = await readRequestActor();
  if (!actor.ok && actor.code === "AUTH_REQUIRED") {
    return NextResponse.json({ ok: true, value: null }, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (!actor.ok) return serviceResponse(actor);
  return serviceResponse({
    ok: true,
    value: { walletAddress: actor.walletAddress },
  });
}
