import { describe, expect, it } from "vitest";

import { readIdempotencyKey } from "./idempotency";

describe("readIdempotencyKey", () => {
  it("accepts an opaque printable request key", () => {
    const request = new Request("https://veila.xyz/api/projects/project-1/matches", {
      headers: { "Idempotency-Key": "match-2026-08-30-001" },
    });

    expect(readIdempotencyKey(request)).toBe("match-2026-08-30-001");
  });

  it("rejects missing, short, and non-printable keys", () => {
    expect(readIdempotencyKey(new Request("https://veila.xyz"))).toBeUndefined();
    expect(readIdempotencyKey(new Request("https://veila.xyz", {
      headers: { "Idempotency-Key": "short" },
    }))).toBeUndefined();
    expect(readIdempotencyKey(new Request("https://veila.xyz", {
      headers: { "Idempotency-Key": "bad key-123" },
    }))).toBeUndefined();
  });
});
