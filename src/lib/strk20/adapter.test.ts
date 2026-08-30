import { describe, expect, it } from "vitest";
import type { STRK20_CALL_AND_PROOF } from "starknet";

import { sameFeltAddress, normalizeFeltAddress } from "./address";
import { Strk20WalletAdapter, type Strk20WalletAccount } from "./adapter";
import { confirmStrk20Transaction } from "./receipt";

const poolAddress = "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";
const token = "0x123";
const recipient = "0x456";
const preparedProof = {
  call: { contract_address: poolAddress, entry_point: "0x1", calldata: [] },
  proof: { data: "", output: [], proof_facts: [] },
} satisfies STRK20_CALL_AND_PROOF;

function fee() {
  return { ok: true as const, value: { feeMinor: "125", blockNumber: 42, fetchedAt: "2026-08-28T00:00:00.000Z" } };
}

function account(overrides: Partial<Strk20WalletAccount> = {}): Strk20WalletAccount {
  return {
    address: "0x99",
    strk20PrepareInvoke: async () => preparedProof,
    strk20InvokeTransaction: async () => ({ transaction_hash: "0xtx" }),
    ...overrides,
  };
}

describe("STRK20 address and wallet adapter", () => {
  it("compares padded, unpadded, uppercase and malformed felt values safely", () => {
    expect(sameFeltAddress("0x01", "0x1")).toBe(true);
    expect(sameFeltAddress("0xABC", "0xabc")).toBe(true);
    expect(normalizeFeltAddress("0x01")).toBe("0x1");
    expect(sameFeltAddress("not-an-address", "0x1")).toBe(false);
    expect(normalizeFeltAddress("-1")).toBeUndefined();
  });

  it("prepares a private transfer without invoking a transaction", async () => {
    const calls: string[] = [];
    const adapter = new Strk20WalletAdapter({
      account: account({
        strk20PrepareInvoke: async (actions, simulate) => {
          calls.push(`${actions[0].type}:${String(simulate)}`);
          return preparedProof;
        },
        strk20InvokeTransaction: async () => {
          calls.push("invoke");
          return { transaction_hash: "0xtx" };
        },
      }),
      poolAddress,
      readPoolFee: async () => fee(),
      receiptProvider: { getTransactionReceipt: async () => ({}), getTransactionTrace: async () => ({}) },
    });

    const result = await adapter.preparePrivateTransfer({ token, amountMinor: "1000", recipient });
    expect(result).toMatchObject({ kind: "prepared", liveFee: "125" });
    expect(calls).toEqual(["transfer:true"]);
  });

  it("prepares a shield deposit as a separate action", async () => {
    let type = "";
    const adapter = new Strk20WalletAdapter({
      account: account({ strk20PrepareInvoke: async (actions) => { type = actions[0].type; return preparedProof; } }),
      poolAddress,
      readPoolFee: async () => fee(),
      receiptProvider: { getTransactionReceipt: async () => ({}), getTransactionTrace: async () => ({}) },
    });
    await expect(adapter.prepareShield({ token, amountMinor: "1000" })).resolves.toMatchObject({ kind: "prepared" });
    expect(type).toBe("deposit");
  });

  it("refuses invalid amounts before reading the fee or wallet", async () => {
    let feeReads = 0;
    const adapter = new Strk20WalletAdapter({
      account: account(),
      poolAddress,
      readPoolFee: async () => { feeReads += 1; return fee(); },
      receiptProvider: { getTransactionReceipt: async () => ({}), getTransactionTrace: async () => ({}) },
    });
    await expect(adapter.prepareShield({ token, amountMinor: "0" })).resolves.toEqual({ kind: "error", code: "PREPARATION_FAILED" });
    expect(feeReads).toBe(0);
  });

  it("maps explicit wallet rejection and recipient registration errors narrowly", async () => {
    const rejected = new Strk20WalletAdapter({
      account: account({ strk20PrepareInvoke: async () => { throw new Error("User rejected request"); } }),
      poolAddress,
      readPoolFee: async () => fee(),
      receiptProvider: { getTransactionReceipt: async () => ({}), getTransactionTrace: async () => ({}) },
    });
    await expect(rejected.prepareShield({ token, amountMinor: "1000" })).resolves.toEqual({ kind: "user_rejected" });

    const recipientError = new Strk20WalletAdapter({
      account: account({ strk20PrepareInvoke: async () => { throw new Error("recipient viewing key is missing"); } }),
      poolAddress,
      readPoolFee: async () => fee(),
      receiptProvider: { getTransactionReceipt: async () => ({}), getTransactionTrace: async () => ({}) },
    });
    await expect(recipientError.preparePrivateTransfer({ token, amountMinor: "1000", recipient })).resolves.toEqual({ kind: "recipient_not_ready" });
  });

  it("submits only when explicitly called and maps unknown failures", async () => {
    const calls: string[] = [];
    const adapter = new Strk20WalletAdapter({
      account: account({ strk20InvokeTransaction: async () => { calls.push("invoke"); return { transaction_hash: "0xtx" }; } }),
      poolAddress,
      readPoolFee: async () => fee(),
      receiptProvider: { getTransactionReceipt: async () => ({}), getTransactionTrace: async () => ({}) },
    });
    await expect(adapter.submit([{ type: "deposit", token, amount: "1000" }])).resolves.toEqual({ kind: "submitted", transactionHash: "0xtx" });
    expect(calls).toEqual(["invoke"]);
  });

  it("confirms only a successful receipt whose trace touches the configured pool", async () => {
    const result = await confirmStrk20Transaction({
      getTransactionReceipt: async () => ({ execution_status: "SUCCEEDED", finality_status: "ACCEPTED_ON_L2" }),
      getTransactionTrace: async () => ({ execute_invocation: { contract_address: "0x040337B1AF3C663E86E333BAB5A4B28DA8D4652A15A69BEEE2B677776FFE812A" } }),
    }, { transactionHash: "0xtx", poolAddress }, { sleep: async () => undefined });
    expect(result).toMatchObject({ kind: "confirmed", transactionHash: "0xtx" });
  });

  it("keeps reverted, timeout and missing-trace outcomes distinct", async () => {
    await expect(confirmStrk20Transaction({
      getTransactionReceipt: async () => ({ execution_status: "REVERTED" }),
      getTransactionTrace: async () => ({}),
    }, { transactionHash: "0xreverted", poolAddress })).resolves.toEqual({ kind: "reverted", transactionHash: "0xreverted", reason: "TRANSACTION_REVERTED" });

    await expect(confirmStrk20Transaction({
      getTransactionReceipt: async () => undefined,
      getTransactionTrace: async () => ({}),
    }, { transactionHash: "0xtimeout", poolAddress }, { maxAttempts: 2, sleep: async () => undefined })).resolves.toEqual({ kind: "unknown", transactionHash: "0xtimeout", reason: "CONFIRMATION_TIMEOUT" });

    await expect(confirmStrk20Transaction({
      getTransactionReceipt: async () => ({ execution_status: "SUCCEEDED", finality_status: "ACCEPTED_ON_L2" }),
      getTransactionTrace: async () => ({ execute_invocation: { contract_address: "0x999" } }),
    }, { transactionHash: "0xmissing", poolAddress }, { sleep: async () => undefined })).resolves.toEqual({ kind: "unknown", transactionHash: "0xmissing", reason: "POOL_TRACE_MISSING" });
  });
});
