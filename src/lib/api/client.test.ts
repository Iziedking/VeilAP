import { describe, expect, it, vi } from "vitest";

import { apiFetch, apiUrl } from "./client";

describe("browser API client", () => {
  it("keeps local development on same-origin paths by default", () => {
    vi.stubEnv("NEXT_PUBLIC_VEIL_API_ORIGIN", "");

    expect(apiUrl("/api/health")).toBe("/api/health");
  });

  it("prefixes a configured API origin and normalizes a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_VEIL_API_ORIGIN", "https://api.veila.xyz/");

    expect(apiUrl("/api/auth/challenge")).toBe("https://api.veila.xyz/api/auth/challenge");
  });

  it("always includes credentials for the session cookie", async () => {
    vi.stubEnv("NEXT_PUBLIC_VEIL_API_ORIGIN", "https://api.veila.xyz");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    await apiFetch("/api/auth/logout", { method: "POST" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.veila.xyz/api/auth/logout",
      expect.objectContaining({ credentials: "include", method: "POST" }),
    );
    fetchMock.mockRestore();
  });

  it("rejects protocol-relative and non-root API paths", () => {
    expect(() => apiUrl("//other.example/api"))
      .toThrow("API_PATH_INVALID");
    expect(() => apiUrl("https://other.example/api"))
      .toThrow("API_PATH_INVALID");
  });
});
