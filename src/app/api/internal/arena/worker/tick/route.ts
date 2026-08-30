import { NextResponse } from "next/server";
import { z } from "zod";

import { readServerConfig } from "@/server/env";
import { hasMatchingInternalSecret } from "@/server/http/internal-secret";
import { jsonBodyErrorResponse, readJsonBody } from "@/server/http/json-body";
import { getArenaWorkerService } from "@/server/projects/runtime";

export const runtime = "nodejs";

const bodySchema = z.object({
  projectId: z.string().trim().min(1).max(200),
  seasonId: z.string().trim().min(1).max(200),
}).strict();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const config = readServerConfig();
  if (!config.arenaWorkerSecret || config.arenaWorkerSecret.length < 64 || !config.arenaWorkerWalletAddress) {
    return json({ ok: false, code: "WORKER_NOT_CONFIGURED" }, 503);
  }
  if (!hasMatchingInternalSecret(config.arenaWorkerSecret, request.headers.get("x-veil-arena-worker-secret"))) {
    return json({ ok: false, code: "WORKER_AUTH_REQUIRED" }, 401);
  }

  try {
    const body = bodySchema.parse(await readJsonBody(request));
    const result = await getArenaWorkerService().runNext({
      projectId: body.projectId,
      seasonId: body.seasonId,
    });
    return json({ ok: true, value: result });
  } catch (error) {
    const bodyError = jsonBodyErrorResponse(error);
    if (bodyError) return bodyError;
    if (error instanceof z.ZodError) return json({ ok: false, code: "INVALID_INPUT" }, 400);
    return json({ ok: false, code: "PERSISTENCE_FAILED" }, 503);
  }
}
