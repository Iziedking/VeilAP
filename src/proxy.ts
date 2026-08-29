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

  const response = NextResponse.next();
  const origin = request.headers.get("origin");
  if (isAllowedApiOrigin(origin)) {
    for (const [key, value] of apiCorsHeaders(origin)) response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
