import type { DomainResult } from "./types";

export type ReleaseState =
  | { kind: "draft" }
  | { kind: "prepared"; preparedAt: string }
  | { kind: "wallet_prompted"; operationId: string }
  | { kind: "submitted"; operationId: string; transactionHash: string }
  | { kind: "confirmed"; transactionHash: string; receiptDigest: string }
  | { kind: "rejected"; code: "USER_REJECTED" }
  | { kind: "reverted"; transactionHash: string; code: string }
  | { kind: "expired" }
  | { kind: "unknown"; operationId: string; transactionHash?: string };

export function promptWallet(
  state: ReleaseState,
  operationId: string,
): DomainResult<ReleaseState> {
  if (state.kind !== "prepared") {
    return { ok: false, code: "ILLEGAL_RELEASE_TRANSITION" };
  }
  return { ok: true, value: { kind: "wallet_prompted", operationId } };
}

export function submitTransaction(
  state: ReleaseState,
  transactionHash: string,
): DomainResult<ReleaseState> {
  if (state.kind !== "wallet_prompted") {
    return { ok: false, code: "ILLEGAL_RELEASE_TRANSITION" };
  }
  return {
    ok: true,
    value: {
      kind: "submitted",
      operationId: state.operationId,
      transactionHash,
    },
  };
}

export function markUnknown(
  state: ReleaseState,
): DomainResult<ReleaseState> {
  if (state.kind === "wallet_prompted") {
    return {
      ok: true,
      value: { kind: "unknown", operationId: state.operationId },
    };
  }
  if (state.kind === "submitted") {
    return {
      ok: true,
      value: {
        kind: "unknown",
        operationId: state.operationId,
        transactionHash: state.transactionHash,
      },
    };
  }
  return { ok: false, code: "ILLEGAL_RELEASE_TRANSITION" };
}

export function confirmTransaction(
  state: ReleaseState,
  receiptDigest: string,
): DomainResult<ReleaseState> {
  if (state.kind !== "submitted" && state.kind !== "unknown") {
    return { ok: false, code: "ILLEGAL_RELEASE_TRANSITION" };
  }
  if (!state.transactionHash) {
    return { ok: false, code: "ILLEGAL_RELEASE_TRANSITION" };
  }
  return {
    ok: true,
    value: {
      kind: "confirmed",
      transactionHash: state.transactionHash,
      receiptDigest,
    },
  };
}
