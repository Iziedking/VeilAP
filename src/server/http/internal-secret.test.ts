import { describe, expect, it } from "vitest";

import { hasMatchingInternalSecret } from "./internal-secret";

describe("internal secret comparison", () => {
  it("accepts the exact secret", () => {
    expect(hasMatchingInternalSecret("worker-secret", "worker-secret")).toBe(true);
  });

  it("rejects missing, different, and differently sized secrets", () => {
    expect(hasMatchingInternalSecret(undefined, "worker-secret")).toBe(false);
    expect(hasMatchingInternalSecret("worker-secret", null)).toBe(false);
    expect(hasMatchingInternalSecret("worker-secret", "wrong-secret")).toBe(false);
    expect(hasMatchingInternalSecret("worker-secret", "worker")).toBe(false);
  });
});
