import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const workerWallet = `0x${"0".repeat(63)}1`;

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(secret: string, body: unknown) {
  return new Request("http://127.0.0.1:3010/api/internal/arena/worker/tick", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-veil-arena-worker-secret": secret,
    },
    body: JSON.stringify(body),
  });
}

describe("arena worker tick route", () => {
  it("rejects a weak worker secret before processing a request", async () => {
    vi.stubEnv("NEXT_PUBLIC_VEILAP_PREVIEW_MODE", "1");
    vi.stubEnv("VEILAP_ARENA_WORKER_SECRET", "too-short");
    vi.stubEnv("VEILAP_ARENA_WORKER_WALLET_ADDRESS", workerWallet);

    const response = await POST(request("too-short", { projectId: "project", seasonId: "season" }));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ ok: false, code: "WORKER_NOT_CONFIGURED" });
  });

  it("rejects unknown or missing fields before the worker runs", async () => {
    const secret = "w".repeat(64);
    vi.stubEnv("NEXT_PUBLIC_VEILAP_PREVIEW_MODE", "1");
    vi.stubEnv("VEILAP_ARENA_WORKER_SECRET", secret);
    vi.stubEnv("VEILAP_ARENA_WORKER_WALLET_ADDRESS", workerWallet);

    const response = await POST(request(secret, { projectId: "project", extra: true }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
  });
});
