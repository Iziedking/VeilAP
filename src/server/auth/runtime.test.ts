import { afterEach, describe, expect, it, vi } from "vitest";

import { expectedOrigin } from "./runtime";

describe("browser origin configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts a trailing slash in the configured app origin", () => {
    vi.stubEnv("VEILAP_APP_ORIGIN", "https://veilap.xyz/");

    expect(expectedOrigin(new Request("https://api.veilap.xyz/api/invitation"))).toBe("https://veilap.xyz");
  });

  it("rejects a configured origin with a path", () => {
    vi.stubEnv("VEILAP_APP_ORIGIN", "https://veilap.xyz/app");

    expect(() => expectedOrigin(new Request("https://api.veilap.xyz/api/invitation"))).toThrow("VEILAP_APP_ORIGIN_INVALID");
  });
});
