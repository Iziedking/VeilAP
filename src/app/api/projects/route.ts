import { NextResponse } from "next/server";
import { z } from "zod";

import { readRequestActor } from "@/server/auth/request-actor";
import { getProjectService } from "@/server/projects/runtime";
import { jsonBodyErrorResponse, readJsonBody } from "@/server/http/json-body";
import { serviceResponse } from "@/server/http/service-response";

export const runtime = "nodejs";

const requestSchema = z.object({
  name: z.string().trim().min(1).max(120),
}).strict();

export async function POST(request: Request) {
  try {
    const actor = await readRequestActor();
    if (!actor.ok) return serviceResponse(actor);
    const input = requestSchema.parse(await readJsonBody(request));
    return serviceResponse(await getProjectService().createProject({
      name: input.name,
      walletAddress: actor.walletAddress,
    }));
  } catch (error) {
    const bodyError = jsonBodyErrorResponse(error);
    if (bodyError) return bodyError;
    return NextResponse.json({ ok: false, code: "INVALID_INPUT" }, { status: 400 });
  }
}
