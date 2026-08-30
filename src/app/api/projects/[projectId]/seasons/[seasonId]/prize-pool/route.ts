import { NextResponse } from "next/server";
import { z } from "zod";

import { readRequestActor } from "@/server/auth/request-actor";
import { readIdempotencyKey } from "@/server/http/idempotency";
import { jsonBodyErrorResponse, readJsonBody } from "@/server/http/json-body";
import { serviceResponse } from "@/server/http/service-response";
import { getArenaPrizePoolService } from "@/server/projects/runtime";

export const runtime = "nodejs";

const createSchema = z.object({
  tokenAddress: z.string().trim().min(1).max(80),
  tokenSymbol: z.string().trim().min(1).max(12),
  amountMinor: z.string().regex(/^[1-9][0-9]*$/),
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; seasonId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId, seasonId } = await context.params;
    const input = createSchema.parse(await readJsonBody(request));
    return serviceResponse(await getArenaPrizePoolService().createPool({
      projectId,
      seasonId,
      actorWalletAddress: actor.walletAddress,
      idempotencyKey: readIdempotencyKey(request) ?? "",
      ...input,
    }));
  } catch (error) {
    const bodyError = jsonBodyErrorResponse(error);
    if (bodyError) return bodyError;
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; seasonId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId, seasonId } = await context.params;
    return serviceResponse(await getArenaPrizePoolService().getPool({
      projectId,
      seasonId,
      actorWalletAddress: actor.walletAddress,
    }));
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
