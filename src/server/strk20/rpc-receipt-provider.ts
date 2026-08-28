import { RpcProvider } from "starknet";

import type { ReceiptTraceProvider } from "@/lib/strk20/receipt";

// starknet@10.4.0 RpcProvider receipt and trace methods, read 2026-08-28.
// This server-only module is the construction point for release reconciliation.
export function createMainnetReceiptProvider(rpcUrl: string): ReceiptTraceProvider {
  const provider = new RpcProvider({ nodeUrl: rpcUrl });
  return {
    getTransactionReceipt: (transactionHash) => provider.getTransactionReceipt(transactionHash),
    getTransactionTrace: (transactionHash) => provider.getTransactionTrace(transactionHash),
  };
}
