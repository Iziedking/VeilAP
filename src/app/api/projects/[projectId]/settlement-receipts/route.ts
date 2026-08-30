import { NextResponse } from "next/server";

import { serviceResponse } from "@/server/http/service-response";
import { getArenaPrizePoolService } from "@/server/projects/runtime";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    return serviceResponse(await getArenaPrizePoolService().listPublicSettlementReceipts(projectId));
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
