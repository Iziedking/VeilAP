import { digestArtifact } from "@/domain/canonical";

import { sameFeltAddress } from "./address";
import type { Strk20Outcome } from "./types";

export interface ReceiptTraceProvider {
  getTransactionReceipt(transactionHash: string): Promise<unknown>;
  getTransactionTrace(transactionHash: string): Promise<unknown>;
}

export interface ConfirmationOptions {
  maxAttempts?: number;
  waitMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

type ReceiptState = "succeeded" | "reverted" | "pending" | "unknown";

export async function confirmStrk20Transaction(
  provider: ReceiptTraceProvider,
  input: { transactionHash: string; poolAddress: string },
  options: ConfirmationOptions = {},
): Promise<Strk20Outcome> {
  const maxAttempts = options.maxAttempts ?? 3;
  const waitMs = options.waitMs ?? 1_000;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let receipt: unknown;
    try {
      receipt = await provider.getTransactionReceipt(input.transactionHash);
    } catch {
      receipt = undefined;
    }

    const state = receiptState(receipt);
    if (state === "reverted") {
      return { kind: "reverted", transactionHash: input.transactionHash, reason: "TRANSACTION_REVERTED" };
    }
    if (state === "succeeded") {
      try {
        const trace = await provider.getTransactionTrace(input.transactionHash);
        if (!traceTouchesPool(trace, input.poolAddress)) {
          return { kind: "unknown", transactionHash: input.transactionHash, reason: "POOL_TRACE_MISSING" };
        }
        return {
          kind: "confirmed",
          transactionHash: input.transactionHash,
          receiptDigest: digestArtifact(JSON.stringify({ receipt, trace })),
        };
      } catch {
        return { kind: "unknown", transactionHash: input.transactionHash, reason: "TRACE_UNAVAILABLE" };
      }
    }
    if (attempt < maxAttempts - 1) await sleep(waitMs);
  }

  return { kind: "unknown", transactionHash: input.transactionHash, reason: "CONFIRMATION_TIMEOUT" };
}

export function traceTouchesPool(trace: unknown, poolAddress: string): boolean {
  const visited = new Set<object>();

  function visit(value: unknown): boolean {
    if (typeof value !== "object" || value === null) return false;
    if (visited.has(value)) return false;
    visited.add(value);
    if (Array.isArray(value)) return value.some(visit);

    for (const [key, nested] of Object.entries(value)) {
      if (ADDRESS_KEYS.has(key) && typeof nested === "string" && sameFeltAddress(nested, poolAddress)) {
        return true;
      }
      if (visit(nested)) return true;
    }
    return false;
  }

  return visit(trace);
}

function receiptState(value: unknown): ReceiptState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "pending";
  const record = value as Record<string, unknown>;
  const executionStatus = typeof record.execution_status === "string"
    ? record.execution_status.toUpperCase()
    : undefined;
  if (executionStatus === "SUCCEEDED") return "succeeded";
  if (executionStatus === "REVERTED") return "reverted";
  return "pending";
}

const ADDRESS_KEYS = new Set([
  "contract_address",
  "contractAddress",
  "to",
  "target",
  "address",
]);
