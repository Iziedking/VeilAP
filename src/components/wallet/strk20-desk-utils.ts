import type { ReceiptTraceProvider } from "@/lib/strk20/receipt";
import type { PoolFeeResult } from "@/lib/strk20/pool-fee";

export async function readLivePoolFee(): Promise<PoolFeeResult> {
  try {
    const response = await fetch("/api/strk20/pool-fee", { cache: "no-store" });
    const body: unknown = await response.json();
    if (!response.ok || !isRecord(body) || body.ok !== true || !isRecord(body.value)) {
      return { ok: false, code: "POOL_FEE_UNAVAILABLE" };
    }
    const feeMinor = body.value.feeMinor;
    const blockNumber = body.value.blockNumber;
    const fetchedAt = body.value.fetchedAt;
    if (
      typeof feeMinor !== "string"
      || !/^[0-9]+$/.test(feeMinor)
      || typeof blockNumber !== "number"
      || !Number.isInteger(blockNumber)
      || typeof fetchedAt !== "string"
    ) {
      return { ok: false, code: "POOL_FEE_INVALID" };
    }
    return { ok: true, value: { feeMinor, blockNumber, fetchedAt } };
  } catch {
    return { ok: false, code: "POOL_FEE_UNAVAILABLE" };
  }
}

export function createClientReceiptProvider(): ReceiptTraceProvider {
  async function rpc(method: string, params: string[]): Promise<unknown> {
    const response = await fetch("/api/starknet/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
      cache: "no-store",
    });
    const body: unknown = await response.json();
    if (!response.ok || !isRecord(body) || body.error) throw new Error("RPC_READ_FAILED");
    return body.result;
  }

  return {
    getTransactionReceipt: (transactionHash) => rpc("starknet_getTransactionReceipt", [transactionHash]),
    getTransactionTrace: (transactionHash) => rpc("starknet_traceTransaction", [transactionHash]),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
