import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  expectedOrigin,
  getAuthRepositories,
  getSessionSecret,
  hasAuthStore,
  requestOrigin,
  SESSION_COOKIE,
} from "@/server/auth/runtime";
import { verifySessionToken } from "@/server/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = requestOrigin(request);
  if (!origin || origin !== expectedOrigin(request)) {
    return NextResponse.json({ ok: false, code: "ORIGIN_MISMATCH" }, { status: 403 });
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token && hasAuthStore()) {
    const verified = verifySessionToken(token, getSessionSecret());
    if (verified.ok && verified.session.sessionId) {
      await getAuthRepositories().sessions.revokeSession(verified.session.sessionId, new Date());
    }
  }
  cookieStore.delete(SESSION_COOKIE);
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
