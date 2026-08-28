import { NextResponse } from "next/server";

import { readRequestActor } from "@/server/auth/request-actor";
import { serviceResponse } from "@/server/http/service-response";
import { getProjectService } from "@/server/projects/runtime";
import { agreementTermsSchema } from "@/server/projects/project-service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId } = await context.params;
    return serviceResponse(await getProjectService().listAgreements({
      projectId,
      walletAddress: actor.walletAddress,
    }));
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId } = await context.params;
    const terms = agreementTermsSchema.parse(await request.json());
    return serviceResponse(await getProjectService().createAgreement({
      projectId,
      actorWalletAddress: actor.walletAddress,
      terms,
    }));
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
