import { describe, expect, it } from "vitest";

import { parseWorkerTickResult } from "./arena-worker-response.mjs";

describe("parseWorkerTickResult", () => {
  it("unwraps a successful idle response", () => {
    expect(parseWorkerTickResult({
      ok: true,
      value: { status: "idle", projectId: "", seasonId: "" },
    })).toEqual({ status: "idle", projectId: "", seasonId: "" });
  });

  it("unwraps a successful completed response", () => {
    expect(parseWorkerTickResult({
      ok: true,
      value: { status: "completed", scheduledMatchId: "match-1" },
    })).toEqual({ status: "completed", scheduledMatchId: "match-1" });
  });

  it("preserves an API failure code", () => {
    expect(() => parseWorkerTickResult({ ok: false, code: "WORKER_AUTH_REQUIRED" })).toThrow("WORKER_AUTH_REQUIRED");
  });

  it("rejects a malformed success envelope", () => {
    expect(() => parseWorkerTickResult({ ok: true, value: { status: 200 } })).toThrow("WORKER_TICK_RESPONSE_INVALID");
  });
});
