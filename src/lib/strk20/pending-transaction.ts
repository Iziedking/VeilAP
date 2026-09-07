import { normalizeFeltAddress } from "./address";

// Same-tab recovery only. Never store keys, proofs, payout plans or recipients.
export function pendingTransactionKey(poolId: string, sponsor: string, operation: "funding" | "settlement" = "funding"): string {
  const address = normalizeFeltAddress(sponsor);
  if (!address) throw new Error("SPONSOR_ADDRESS_INVALID");
  return `veil-arena:${operation}:${encodeURIComponent(poolId)}:${address}`;
}

export function readPendingTransaction(storage: Pick<Storage, "getItem">, key: string): string | null {
  const value = storage.getItem(key);
  if (value === null) return null;
  if (!/^0x[0-9a-f]+$/i.test(value)) throw new Error("PENDING_TRANSACTION_INVALID");
  return value;
}

export function savePendingTransaction(storage: Pick<Storage, "setItem">, key: string, hash: string): void {
  if (!/^0x[0-9a-f]+$/i.test(hash)) throw new Error("TRANSACTION_HASH_INVALID");
  storage.setItem(key, hash);
}
