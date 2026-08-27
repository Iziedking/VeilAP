import { describe, expect, it } from "vitest";

import { createAgreement, validateAgreementVersion } from "./agreement";
import { canonicalize, commitment, digestArtifact } from "./canonical";
import { createCheckpoint, verifyCheckpointArtifact } from "./checkpoint";
import { computeRoyalty, parseDecimalToMinor } from "./money";
import {
  markReleaseUnknown,
  promptReleaseWallet,
  reserveRelease,
  submitReleaseTransaction,
  type ReleaseLedger,
} from "./release";

const agreementInput = {
  schemaVersion: 1 as const,
  chainId: "SN_MAIN" as const,
  projectId: "VAP-0827",
  version: 2,
  companyWallet: "0x0123",
  contributorWalletHash: "9fc4ca9a4d58a90bca1f014f10902c308e6a502e33c9ad15b78ea7f514bf75d2",
  acceptanceCriteria: [
    { id: "build", description: "Deliver the compliance circuit module." },
    { id: "tests", description: "Pass the agreed deterministic fixtures." },
  ],
  milestoneMinor: "47850000000",
  royaltyBps: 750,
  expiresAt: "2026-09-30T23:59:59.000Z",
};

describe("money", () => {
  it("represents 47,850 USDC as six-decimal minor units", () => {
    expect(parseDecimalToMinor("47,850", 6)).toBe(47_850_000_000n);
  });

  it("floors royalty arithmetic in integer minor units", () => {
    expect(computeRoyalty(125_000_000n, 750)).toBe(9_375_000n);
    expect(computeRoyalty(1n, 750)).toBe(0n);
  });
});

describe("canonical commitments", () => {
  it("does not change when object keys are reordered", () => {
    expect(commitment({ b: 2, a: 1 })).toBe(commitment({ a: 1, b: 2 }));
    expect(canonicalize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("changes when one acceptance criterion changes", () => {
    const original = createAgreement(agreementInput);
    const changed = createAgreement({
      ...agreementInput,
      acceptanceCriteria: [
        agreementInput.acceptanceCriteria[0],
        { id: "tests", description: "Pass the agreed fixtures and security review." },
      ],
    });

    expect(changed.digest).not.toBe(original.digest);
    expect(changed.acceptanceCriteriaDigest).not.toBe(original.acceptanceCriteriaDigest);
  });
});

describe("agreement and checkpoint binding", () => {
  it("refuses a decision against a stale agreement", () => {
    expect(validateAgreementVersion(3, 2)).toEqual({
      ok: false,
      code: "AGREEMENT_STALE",
    });
  });

  it("binds a checkpoint to project, agreement version, sequence and artifact", () => {
    const artifactDigest = digestArtifact("fixed compliance module fixture");
    const checkpoint = createCheckpoint({
      schemaVersion: 1,
      id: "CHK-0002",
      projectId: "VAP-0827",
      agreementVersion: 2,
      sequence: 2,
      artifactDigest,
      submittedByRole: "contributor",
      submittedAt: "2026-08-27T12:00:00.000Z",
    });

    const mutations = [
      { ...checkpoint.input, projectId: "VAP-OTHER" },
      { ...checkpoint.input, agreementVersion: 3 },
      { ...checkpoint.input, sequence: 3 },
      { ...checkpoint.input, artifactDigest: digestArtifact("different artifact") },
    ];

    for (const mutation of mutations) {
      expect(createCheckpoint(mutation).digest).not.toBe(checkpoint.digest);
    }
  });

  it("reports changed artifact bytes as tampered", () => {
    const checkpoint = createCheckpoint({
      schemaVersion: 1,
      id: "CHK-0001",
      projectId: "VAP-0827",
      agreementVersion: 2,
      sequence: 1,
      artifactDigest: digestArtifact("recorded artifact"),
      submittedByRole: "contributor",
      submittedAt: "2026-08-27T11:00:00.000Z",
    });

    expect(verifyCheckpointArtifact(checkpoint, "changed artifact")).toEqual({
      ok: false,
      code: "ARTIFACT_TAMPERED",
    });
  });
});

describe("release reservation", () => {
  const emptyLedger: ReleaseLedger = { releases: [] };

  it("refuses a second release for one source", () => {
    const first = reserveRelease(emptyLedger, {
      id: "REL-0001",
      projectId: "VAP-0827",
      kind: "milestone",
      sourceId: "CHK-0002",
      amountMinor: 47_850_000_000n,
      preparedAt: "2026-08-27T12:30:00.000Z",
    });

    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Expected the first release to reserve.");

    expect(
      reserveRelease(first.value.ledger, {
        id: "REL-0002",
        projectId: "VAP-0827",
        kind: "milestone",
        sourceId: "CHK-0002",
        amountMinor: 47_850_000_000n,
        preparedAt: "2026-08-27T12:30:00.000Z",
      }),
    ).toEqual({ ok: false, code: "DUPLICATE_RELEASE" });
  });

  it("blocks a new release while an earlier operation is unknown", () => {
    const first = reserveRelease(emptyLedger, {
      id: "REL-0001",
      projectId: "VAP-0827",
      kind: "milestone",
      sourceId: "CHK-0002",
      amountMinor: 47_850_000_000n,
      preparedAt: "2026-08-27T12:30:00.000Z",
    });

    if (!first.ok) throw new Error("Expected the first release to reserve.");
    const prompted = promptReleaseWallet(first.value.release, "OP-0001");
    if (!prompted.ok) throw new Error("Expected the wallet prompt transition.");
    const submitted = submitReleaseTransaction(prompted.value, "0x0abc");
    if (!submitted.ok) throw new Error("Expected the submitted transition.");
    const unresolved = markReleaseUnknown(submitted.value);
    if (!unresolved.ok) throw new Error("Expected the release to enter unknown.");

    const ledger: ReleaseLedger = { releases: [unresolved.value] };
    expect(
      reserveRelease(ledger, {
        id: "REL-0002",
        projectId: "VAP-0827",
        kind: "royalty",
        sourceId: "REV-2026-08",
        amountMinor: 9_375_000n,
        preparedAt: "2026-08-27T12:31:00.000Z",
      }),
    ).toEqual({ ok: false, code: "UNRESOLVED_RELEASE" });
  });
});
