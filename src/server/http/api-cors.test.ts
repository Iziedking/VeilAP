import { beforeEach, describe, expect, it } from "vitest";

import {
  apiCorsHeaders,
  handleApiCorsPreflight,
  isAllowedApiOrigin,
  withApiCors,
} from "./api-cors";

describe("API CORS boundary", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_VEILAP_PREVIEW_MODE = "0";
    process.env.VEILAP_APP_ORIGIN = "https://veila.xyz";
  });

  it("allows only the configured frontend origin", () => {
    expect(isAllowedApiOrigin("https://veila.xyz")).toBe(true);
    expect(isAllowedApiOrigin("https://veila.xyz.evil.example")).toBe(false);
    expect(isAllowedApiOrigin("https://other.example")).toBe(false);
  });

  it("allows loopback origins only in preview mode", () => {
    process.env.NEXT_PUBLIC_VEILAP_PREVIEW_MODE = "1";
    process.env.VEILAP_APP_ORIGIN = "http://127.0.0.1:3003";

    expect(isAllowedApiOrigin("http://localhost:3003")).toBe(true);
    expect(isAllowedApiOrigin("http://127.0.0.1:4174")).toBe(true);

    process.env.NEXT_PUBLIC_VEILAP_PREVIEW_MODE = "0";
    expect(isAllowedApiOrigin("http://localhost:3003")).toBe(false);
  });

  it("returns a credentialed preflight only for an allowed origin", () => {
    const allowed = handleApiCorsPreflight(new Request("https://api.veila.xyz/api/auth/challenge", {
      method: "OPTIONS",
      headers: { Origin: "https://veila.xyz" },
    }));
    expect(allowed?.status).toBe(204);
    expect(allowed?.headers.get("Access-Control-Allow-Origin")).toBe("https://veila.xyz");
    expect(allowed?.headers.get("Access-Control-Allow-Credentials")).toBe("true");

    const denied = handleApiCorsPreflight(new Request("https://api.veila.xyz/api/auth/challenge", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    }));
    expect(denied?.status).toBe(403);
  });

  it("adds CORS headers without replacing route response headers", () => {
    const response = new Response("ok", { headers: { "Cache-Control": "no-store" } });
    const result = withApiCors(response, new Request("https://api.veila.xyz/api/health", {
      headers: { Origin: "https://veila.xyz" },
    }));

    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(result.headers.get("Access-Control-Allow-Origin")).toBe("https://veila.xyz");
  });

  it("builds the expected shared policy headers", () => {
    const headers = apiCorsHeaders("https://veila.xyz");
    expect(headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, PUT, OPTIONS");
    expect(headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, Idempotency-Key, Authorization");
  });
});
