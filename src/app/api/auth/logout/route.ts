import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { expectedOrigin, requestOrigin, SESSION_COOKIE } from "@/server/auth/runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = requestOrigin(request);
  if (!origin || origin !== expectedOrigin(request)) {
    return NextResponse.json({ ok: false, code: "ORIGIN_MISMATCH" }, { status: 403 });
  }
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
