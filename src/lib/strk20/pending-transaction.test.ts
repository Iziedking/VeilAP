import { describe, expect, it } from "vitest";
import { pendingTransactionKey, readPendingTransaction, savePendingTransaction } from "./pending-transaction";

describe("funding recovery", () => {
  it("resumes the same hash after reload and isolates sponsors and pools", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const key = pendingTransactionKey("pool-1", "0x01");
    savePendingTransaction(storage, key, "0xabc");
    expect(readPendingTransaction(storage, pendingTransactionKey("pool-1", "0x1"))).toBe("0xabc");
    expect(readPendingTransaction(storage, pendingTransactionKey("pool-2", "0x1"))).toBeNull();
    expect(readPendingTransaction(storage, pendingTransactionKey("pool-1", "0x2"))).toBeNull();
    expect(readPendingTransaction(storage, pendingTransactionKey("pool-1", "0x1", "settlement"))).toBeNull();
    savePendingTransaction(storage, pendingTransactionKey("pool-1", "0x1", "settlement"), "0xdef");
    expect(readPendingTransaction(storage, key)).toBe("0xabc");
    expect(readPendingTransaction(storage, pendingTransactionKey("pool-1", "0x1", "settlement"))).toBe("0xdef");
    expect(() => readPendingTransaction({ getItem: () => "damaged" }, key)).toThrow("PENDING_TRANSACTION_INVALID");
  });
});
