import { describe, expect, it } from "vitest";

import { confirmStrk20Transaction, traceTouchesPool } from "./receipt";

const poolAddress = "0x456";

describe("STRK20 receipt confirmation", () => {
  it("requires accepted finality and a successful direct pool invocation", async () => {
    const receipt = {
      execution_status: "SUCCEEDED",
      finality_status: "ACCEPTED_ON_L2",
    };
    const trace = {
      execute_invocation: {
        contract_address: poolAddress,
        calldata: ["0x1"],
        calls: [],
        is_reverted: false,
      },
    };
    const provider = {
      getTransactionReceipt: async () => receipt,
      getTransactionTrace: async () => trace,
    };

    await expect(confirmStrk20Transaction(provider, {
      transactionHash: "0xabc",
      poolAddress,
    })).resolves.toMatchObject({ kind: "confirmed" });
    expect(traceTouchesPool(trace, poolAddress)).toBe(true);
  });

  it("does not accept execution success before Starknet finality", async () => {
    const provider = {
      getTransactionReceipt: async () => ({
        execution_status: "SUCCEEDED",
        finality_status: "RECEIVED",
      }),
      getTransactionTrace: async () => ({ execute_invocation: { contract_address: poolAddress } }),
    };

    await expect(confirmStrk20Transaction(provider, {
      transactionHash: "0xabc",
      poolAddress,
    }, { maxAttempts: 1 })).resolves.toEqual({
      kind: "unknown",
      transactionHash: "0xabc",
      reason: "CONFIRMATION_TIMEOUT",
    });
  });

  it("ignores unrelated address fields and reverted pool calls", () => {
    expect(traceTouchesPool({ address: poolAddress }, poolAddress)).toBe(false);
    expect(traceTouchesPool({
      execute_invocation: { contract_address: poolAddress, is_reverted: true },
    }, poolAddress)).toBe(false);
  });

  it("bounds provider calls", async () => {
    const never = new Promise<unknown>(() => undefined);
    await expect(confirmStrk20Transaction({
      getTransactionReceipt: async () => never,
      getTransactionTrace: async () => ({}),
    }, {
      transactionHash: "0xabc",
      poolAddress,
    }, {
      maxAttempts: 1,
      requestTimeoutMs: 5,
    })).resolves.toEqual({
      kind: "unknown",
      transactionHash: "0xabc",
      reason: "CONFIRMATION_TIMEOUT",
    });
  });
});
