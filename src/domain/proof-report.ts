import { createAgreement, validateAgreementVersion } from "./agreement";
import { digestArtifact } from "./canonical";
import { createCheckpoint, verifyCheckpointArtifact } from "./checkpoint";
import { computeRoyalty } from "./money";
import {
  confirmRelease,
  markReleaseUnknown,
  promptReleaseWallet,
  reserveRelease,
  submitReleaseTransaction,
  type ReleaseRecord,
} from "./release";

const preparedAt = "2026-08-27T12:30:00.000Z";

function requireRelease(
  result: ReturnType<typeof reserveRelease>,
): ReleaseRecord {
  if (!result.ok) throw new Error(result.code);
  return result.value.release;
}

function requireTransition(
  result: ReturnType<typeof promptReleaseWallet>
    | ReturnType<typeof submitReleaseTransaction>
    | ReturnType<typeof markReleaseUnknown>
    | ReturnType<typeof confirmRelease>,
): ReleaseRecord {
  if (!result.ok) throw new Error(result.code);
  return result.value;
}

export function buildProofReport() {
  const agreement = createAgreement({
    schemaVersion: 1,
    chainId: "SN_MAIN",
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
  });

  const artifact = "fixed compliance module fixture";
  const checkpoint = createCheckpoint({
    schemaVersion: 1,
    id: "CHK-0002",
    projectId: agreement.input.projectId,
    agreementVersion: agreement.input.version,
    sequence: 2,
    artifactDigest: digestArtifact(artifact),
    submittedByRole: "contributor",
    submittedAt: "2026-08-27T12:00:00.000Z",
  });

  const reserved = reserveRelease({ releases: [] }, {
    id: "REL-0001",
    projectId: agreement.input.projectId,
    kind: "milestone",
    sourceId: checkpoint.input.id,
    amountMinor: 47_850_000_000n,
    preparedAt,
  });
  const milestone = requireRelease(reserved);
  const prompted = requireTransition(promptReleaseWallet(milestone, "OP-0001"));
  const submitted = requireTransition(
    submitReleaseTransaction(prompted, "0x0abc"),
  );
  const confirmed = requireTransition(
    confirmRelease(submitted, digestArtifact("successful receipt and pool trace")),
  );

  const unknownBase = requireRelease(reserveRelease({ releases: [] }, {
    id: "REL-0002",
    projectId: agreement.input.projectId,
    kind: "royalty",
    sourceId: "REV-2026-08",
    amountMinor: computeRoyalty(125_000_000n, agreement.input.royaltyBps),
    preparedAt,
  }));
  const unknownPrompted = requireTransition(
    promptReleaseWallet(unknownBase, "OP-0002"),
  );
  const unknownSubmitted = requireTransition(
    submitReleaseTransaction(unknownPrompted, "0x0def"),
  );
  const unknown = requireTransition(markReleaseUnknown(unknownSubmitted));

  const duplicate = reserved.ok
    ? reserveRelease(reserved.value.ledger, {
        id: "REL-0003",
        projectId: agreement.input.projectId,
        kind: "milestone",
        sourceId: checkpoint.input.id,
        amountMinor: 47_850_000_000n,
        preparedAt,
      })
    : reserved;

  return {
    agreementDigest: agreement.digest,
    checkpointDigest: checkpoint.digest,
    validAcceptance: validateAgreementVersion(2, 2),
    tamperedEvidence: verifyCheckpointArtifact(checkpoint, `${artifact} changed`),
    staleAgreement: validateAgreementVersion(3, 2),
    duplicateRelease: duplicate.ok ? { ok: true } : duplicate,
    royaltyCalculation: {
      revenueMinor: "125000000",
      royaltyBps: agreement.input.royaltyBps,
      amountMinor: computeRoyalty(125_000_000n, agreement.input.royaltyBps).toString(),
    },
    reconciliation: {
      confirmed: confirmed.state,
      unknown: unknown.state,
    },
    limitation: "VeilAP proves its recorded process; it does not prove legal ownership or defect-free work.",
  };
}
