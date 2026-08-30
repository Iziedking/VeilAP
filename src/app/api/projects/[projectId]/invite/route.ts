import { NextResponse } from "next/server";
import { z } from "zod";

import { readRequestActor } from "@/server/auth/request-actor";
import { jsonBodyErrorResponse, readJsonBody } from "@/server/http/json-body";
import { serviceResponse } from "@/server/http/service-response";
import { getProjectService } from "@/server/projects/runtime";

export const runtime = "nodejs";

const requestSchema = z.object({
  walletAddress: z.string().min(3).max(80),
  role: z.enum(["contributor", "reviewer", "auditor"]),
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const { projectId } = await context.params;
    const input = requestSchema.parse(await readJsonBody(request));
    return serviceResponse(await getProjectService().inviteMember({
      projectId,
      actorWalletAddress: actor.walletAddress,
      walletAddress: input.walletAddress,
      role: input.role,
    }));
  } catch (error) {
    const bodyError = jsonBodyErrorResponse(error);
    if (bodyError) return bodyError;
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
