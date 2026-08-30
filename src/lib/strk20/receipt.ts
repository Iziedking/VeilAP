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
  requestTimeoutMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

type ReceiptState = "succeeded" | "reverted" | "pending";

export async function confirmStrk20Transaction(
  provider: ReceiptTraceProvider,
  input: { transactionHash: string; poolAddress: string },
  options: ConfirmationOptions = {},
): Promise<Strk20Outcome> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const waitMs = Math.max(0, options.waitMs ?? 1_000);
  const requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? 10_000);
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let receipt: unknown;
    try {
      receipt = await withTimeout(
        provider.getTransactionReceipt(input.transactionHash),
        requestTimeoutMs,
      );
    } catch {
      receipt = undefined;
    }

    const state = receiptState(receipt);
    if (state === "reverted") {
      return { kind: "reverted", transactionHash: input.transactionHash, reason: "TRANSACTION_REVERTED" };
    }
    if (state === "succeeded") {
      try {
        const trace = await withTimeout(
          provider.getTransactionTrace(input.transactionHash),
          requestTimeoutMs,
        );
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
    if (typeof value !== "object" || value === null || visited.has(value)) return false;
    visited.add(value);
    if (Array.isArray(value)) return value.some(visit);

    const record = value as Record<string, unknown>;
    const contractAddress = stringField(record, "contract_address", "contractAddress");
    const reverted = record.is_reverted === true || record.isReverted === true;
    if (contractAddress && !reverted && sameFeltAddress(contractAddress, poolAddress)) return true;
    return Object.values(record).some(visit);
  }

  return visit(trace);
}

function receiptState(value: unknown): ReceiptState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "pending";
  const record = value as Record<string, unknown>;
  const executionStatus = stringField(record, "execution_status", "executionStatus")?.toUpperCase();
  const finalityStatus = stringField(record, "finality_status", "finalityStatus")?.toUpperCase();
  if (executionStatus === "REVERTED") return "reverted";
  if (
    executionStatus === "SUCCEEDED"
    && (finalityStatus === "ACCEPTED_ON_L2" || finalityStatus === "ACCEPTED_ON_L1")
  ) {
    return "succeeded";
  }
  return "pending";
}

function stringField(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    if (typeof record[key] === "string") return record[key];
  }
  return undefined;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("RPC_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
