import { NextResponse } from "next/server";
import { readRequestActor } from "@/server/auth/request-actor";
import { jsonBodyErrorResponse, readJsonBody } from "@/server/http/json-body";
import { serviceResponse } from "@/server/http/service-response";
import { getArenaPrizePoolService } from "@/server/projects/runtime";
import { arenaTransferConfirmationSchema } from "@/server/arena/arena-prize-pool-service";
import { z } from "zod";

export const runtime = "nodejs";

const fundingTransactionSchema = z.object({
  transactionHash: z.string().trim().min(3).max(80),
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; seasonId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId, seasonId } = await context.params;
    const body = await readJsonBody(request);
    if (typeof body === "object" && body !== null && "authorization" in body) {
      const confirmation = arenaTransferConfirmationSchema.parse(body);
      return serviceResponse(await getArenaPrizePoolService().confirmFunding({
        projectId,
        seasonId,
        actorWalletAddress: actor.walletAddress,
        confirmation,
      }));
    }
    const funding = fundingTransactionSchema.parse(body);
    return serviceResponse(await getArenaPrizePoolService().confirmFundingTransaction({
      projectId,
      seasonId,
      actorWalletAddress: actor.walletAddress,
      transactionHash: funding.transactionHash,
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
    return serviceResponse(await getArenaPrizePoolService().getFundingTransactionPlan({
      projectId,
      seasonId,
      actorWalletAddress: actor.walletAddress,
    }));
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
