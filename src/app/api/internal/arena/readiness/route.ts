import { NextResponse } from "next/server";

import { readServerConfig } from "@/server/env";
import { hasMatchingInternalSecret } from "@/server/http/internal-secret";
import { getArenaReadinessService } from "@/server/projects/runtime";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const config = readServerConfig();
  if (!hasMatchingInternalSecret(config.arenaWorkerSecret, request.headers.get("x-veil-arena-worker-secret"))) {
    return json({ ok: false, code: "WORKER_AUTH_REQUIRED" }, 401);
  }
  try {
    const report = await getArenaReadinessService().check();
    return json({ ok: true, value: report }, report.ready ? 200 : 503);
  } catch {
    return json({ ok: false, code: "PERSISTENCE_FAILED" }, 503);
  }
}
