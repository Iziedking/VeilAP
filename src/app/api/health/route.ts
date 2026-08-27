import { NextResponse } from "next/server";

import { readServerConfig } from "@/server/env";
import { getDatabase } from "@/server/db/client";
import { pingDatabase } from "@/server/db/repositories";

export const runtime = "nodejs";

export async function GET() {
  const config = readServerConfig();
  if (config.mode === "preview") {
    return NextResponse.json({ ok: true, mode: "preview", database: "not_required" });
  }
  if (config.missing.length > 0) {
    return NextResponse.json(
      { ok: false, code: "CONFIGURATION_MISSING", mode: "persisted" },
      { status: 503 },
    );
  }
  try {
    await pingDatabase(getDatabase(config.databaseUrl));
    return NextResponse.json({ ok: true, mode: "persisted", database: "reachable" });
  } catch {
    return NextResponse.json(
      { ok: false, code: "DATABASE_UNAVAILABLE", mode: "persisted" },
      { status: 503 },
    );
  }
}
