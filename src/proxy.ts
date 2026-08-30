import { NextRequest, NextResponse } from "next/server";

import {
  apiCorsHeaders,
  handleApiCorsPreflight,
  isAllowedApiOrigin,
} from "@/server/http/api-cors";

export function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();

  if (request.method === "OPTIONS") {
    const preflight = handleApiCorsPreflight(request);
    if (preflight) return preflight;
  }

  const origin = request.headers.get("origin");
  if (origin !== null && !isAllowedApiOrigin(origin)) {
    return NextResponse.json(
      { ok: false, code: "ORIGIN_NOT_ALLOWED" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const response = NextResponse.next();
  if (isAllowedApiOrigin(origin)) {
    for (const [key, value] of apiCorsHeaders(origin)) response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
