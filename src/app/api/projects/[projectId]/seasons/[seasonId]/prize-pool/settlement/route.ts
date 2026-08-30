import { NextResponse } from "next/server";
import { readRequestActor } from "@/server/auth/request-actor";
import { jsonBodyErrorResponse, readJsonBody } from "@/server/http/json-body";
import { serviceResponse } from "@/server/http/service-response";
import { getArenaPrizePoolService } from "@/server/projects/runtime";
import { arenaTransferConfirmationSchema } from "@/server/arena/arena-prize-pool-service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; seasonId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId, seasonId } = await context.params;
    return serviceResponse(await getArenaPrizePoolService().getSettlementTransactionPlan({
      projectId,
      seasonId,
      actorWalletAddress: actor.walletAddress,
    }));
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ projectId: string; seasonId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId, seasonId } = await context.params;
    return serviceResponse(await getArenaPrizePoolService().prepareSettlement({
      projectId,
      seasonId,
      actorWalletAddress: actor.walletAddress,
    }));
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string; seasonId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId, seasonId } = await context.params;
    const confirmation = arenaTransferConfirmationSchema.parse(await readJsonBody(request));
    return serviceResponse(await getArenaPrizePoolService().confirmSettlement({
      projectId,
      seasonId,
      actorWalletAddress: actor.walletAddress,
      confirmation,
    }));
  } catch (error) {
    const bodyError = jsonBodyErrorResponse(error);
    if (bodyError) return bodyError;
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
