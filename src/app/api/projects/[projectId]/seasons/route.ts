import { NextResponse } from "next/server";
import { z } from "zod";

import { readRequestActor } from "@/server/auth/request-actor";
import { readIdempotencyKey } from "@/server/http/idempotency";
import { serviceResponse } from "@/server/http/service-response";
import { getArenaSeasonService } from "@/server/projects/runtime";

export const runtime = "nodejs";

const requestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  rulesetVersion: z.string().trim().min(1).max(40),
  startsAt: z.string().min(1),
  locksAt: z.string().min(1),
  endsAt: z.string().min(1),
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId } = await context.params;
    const input = requestSchema.parse(await request.json());
    return serviceResponse(await getArenaSeasonService().createSeason({
      projectId,
      actorWalletAddress: actor.walletAddress,
      idempotencyKey: readIdempotencyKey(request) ?? "",
      ...input,
    }));
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    return serviceResponse(await getArenaSeasonService().listPublicSeasons(projectId));
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
