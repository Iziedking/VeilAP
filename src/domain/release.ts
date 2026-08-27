import {
  confirmTransaction,
  markUnknown,
  promptWallet,
  submitTransaction,
  type ReleaseState,
} from "./state-machines";
import type { DomainResult } from "./types";

export type ReleaseKind = "milestone" | "royalty";

export type ReleaseRecord = Readonly<{
  id: string;
  projectId: string;
  kind: ReleaseKind;
  sourceId: string;
  amountMinor: bigint;
  state: ReleaseState;
}>;

export type ReleaseLedger = Readonly<{
  releases: readonly ReleaseRecord[];
}>;

export type ReserveReleaseInput = Readonly<{
  id: string;
  projectId: string;
  kind: ReleaseKind;
  sourceId: string;
  amountMinor: bigint;
  preparedAt: string;
}>;

export function reserveRelease(
  ledger: ReleaseLedger,
  input: ReserveReleaseInput,
): DomainResult<{ ledger: ReleaseLedger; release: ReleaseRecord }> {
  if (input.amountMinor <= 0n) {
    return { ok: false, code: "RELEASE_AMOUNT_INVALID" };
  }

  const duplicate = ledger.releases.some((release) =>
    release.projectId === input.projectId
    && release.kind === input.kind
    && release.sourceId === input.sourceId
  );
  if (duplicate) return { ok: false, code: "DUPLICATE_RELEASE" };

  const unresolved = ledger.releases.some((release) =>
    release.projectId === input.projectId
    && (release.state.kind === "submitted" || release.state.kind === "unknown")
  );
  if (unresolved) return { ok: false, code: "UNRESOLVED_RELEASE" };

  const release: ReleaseRecord = {
    id: input.id,
    projectId: input.projectId,
    kind: input.kind,
    sourceId: input.sourceId,
    amountMinor: input.amountMinor,
    state: { kind: "prepared", preparedAt: input.preparedAt },
  };

  return {
    ok: true,
    value: {
      release,
      ledger: { releases: [...ledger.releases, release] },
    },
  };
}

export function promptReleaseWallet(
  release: ReleaseRecord,
  operationId: string,
): DomainResult<ReleaseRecord> {
  const next = promptWallet(release.state, operationId);
  return next.ok ? { ok: true, value: { ...release, state: next.value } } : next;
}

export function submitReleaseTransaction(
  release: ReleaseRecord,
  transactionHash: string,
): DomainResult<ReleaseRecord> {
  const next = submitTransaction(release.state, transactionHash);
  return next.ok ? { ok: true, value: { ...release, state: next.value } } : next;
}

export function markReleaseUnknown(
  release: ReleaseRecord,
): DomainResult<ReleaseRecord> {
  const next = markUnknown(release.state);
  return next.ok ? { ok: true, value: { ...release, state: next.value } } : next;
}

export function confirmRelease(
  release: ReleaseRecord,
  receiptDigest: string,
): DomainResult<ReleaseRecord> {
  const next = confirmTransaction(release.state, receiptDigest);
  return next.ok ? { ok: true, value: { ...release, state: next.value } } : next;
}
