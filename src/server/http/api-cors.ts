import { isLoopbackOrigin } from "@/server/env";

const ALLOWED_METHODS = "GET, POST, PUT, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Idempotency-Key";

function validOrigin(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.origin === value ? value : undefined;
  } catch {
    return undefined;
  }
}

export function isAllowedApiOrigin(origin: string | null): origin is string {
  const candidate = validOrigin(origin);
  if (!candidate) return false;

  const configured = validOrigin(process.env.VEILAP_APP_ORIGIN ?? null);
  if (configured === candidate) return true;

  return process.env.NEXT_PUBLIC_VEILAP_PREVIEW_MODE === "1"
    && isLoopbackOrigin(candidate)
    && (!configured || isLoopbackOrigin(configured));
}

export function apiCorsHeaders(origin: string): Headers {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
  headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  headers.set("Vary", "Origin");
  return headers;
}

export function withApiCors(response: Response, request: Request): Response {
  const origin = request.headers.get("origin");
  if (!isAllowedApiOrigin(origin)) return response;

  for (const [key, value] of apiCorsHeaders(origin)) response.headers.set(key, value);
  return response;
}

export function handleApiCorsPreflight(request: Request): Response | undefined {
  if (request.method !== "OPTIONS") return undefined;
  const origin = request.headers.get("origin");
  if (!isAllowedApiOrigin(origin)) {
    return new Response(JSON.stringify({ ok: false, code: "ORIGIN_NOT_ALLOWED" }), {
      status: 403,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  return new Response(null, { status: 204, headers: apiCorsHeaders(origin) });
}
