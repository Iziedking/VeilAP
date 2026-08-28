import type { STRK20_ACTION, STRK20_CALL_AND_PROOF } from "starknet";

export type Strk20Action = STRK20_ACTION;

export type Strk20Outcome =
  | { kind: "unsupported"; minimum: "0.10.3" }
  | { kind: "recipient_not_ready" }
  | { kind: "insufficient_private_balance" }
  | { kind: "user_rejected" }
  | { kind: "prepared"; liveFee: string; callAndProof: STRK20_CALL_AND_PROOF }
  | { kind: "submitted"; transactionHash: string }
  | { kind: "confirmed"; transactionHash: string; receiptDigest: string }
  | { kind: "reverted"; transactionHash: string; reason: string }
  | { kind: "expired"; reason: string }
  | { kind: "unknown"; transactionHash?: string; reason?: string }
  | { kind: "error"; code: "PREPARATION_FAILED" | "SUBMISSION_FAILED" };

export type Strk20Operation = "shield" | "private_transfer";

export interface PoolFee {
  feeMinor: string;
  blockNumber: number;
  fetchedAt: string;
}
