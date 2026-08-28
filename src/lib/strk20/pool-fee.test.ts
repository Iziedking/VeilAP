import { describe, expect, it } from "vitest";

import { PoolFeeReader, type PoolFeeRpc } from "./pool-fee";

function rpc(overrides: Partial<PoolFeeRpc> = {}): PoolFeeRpc {
  return {
    callContract: async () => ["0x7b"],
    getBlockWithTxHashes: async () => ({ block_number: 41 }),
    ...overrides,
  };
}

describe("PoolFeeReader", () => {
  it("reads one felt fee and block number, then caches for 30 seconds", async () => {
    let now = new Date("2026-08-28T00:00:00.000Z");
    let calls = 0;
    const reader = new PoolFeeReader({
      rpc: rpc({ callContract: async () => { calls += 1; return ["0x7b"]; } }),
      poolAddress: "0xpool",
      now: () => now,
    });
    await expect(reader.read()).resolves.toMatchObject({ ok: true, value: { feeMinor: "123", blockNumber: 41 } });
    now = new Date(now.getTime() + 29_999);
    await reader.read();
    expect(calls).toBe(1);
    now = new Date(now.getTime() + 1);
    await reader.read();
    expect(calls).toBe(2);
  });

  it("refuses malformed fee shapes and missing block numbers", async () => {
    await expect(new PoolFeeReader({
      rpc: rpc({ callContract: async () => ["1", "2"] }),
      poolAddress: "0xpool",
    }).read()).resolves.toEqual({ ok: false, code: "POOL_FEE_INVALID" });
    await expect(new PoolFeeReader({
      rpc: rpc({ callContract: async () => ["not-felt"] }),
      poolAddress: "0xpool",
    }).read()).resolves.toEqual({ ok: false, code: "POOL_FEE_INVALID" });
    await expect(new PoolFeeReader({
      rpc: rpc({ getBlockWithTxHashes: async () => ({ block_hash: "0x1" }) }),
      poolAddress: "0xpool",
    }).read()).resolves.toEqual({ ok: false, code: "POOL_FEE_UNAVAILABLE" });
  });
});
