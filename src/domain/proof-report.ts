import {
  ARENA_ENGINE_VERSION,
  runMatch,
  transcriptProof,
  verifyTranscriptProof,
} from "./arena/poker-engine";
import {
  compileStrategyAgent,
  parseStrategyPolicy,
} from "./arena/strategy-policy";
import { commitment } from "./canonical";

const matchInput = {
  hands: 8,
  matchId: "AUDIT-MATCH-001",
  seed: "veil-arena-release-proof-v2",
} as const;

function runReleaseProofMatch() {
  const nightjar = compileStrategyAgent("NIGHTJAR", parseStrategyPolicy({
    schemaVersion: 1,
    displayName: "Nightjar",
    rules: [
      { minHoleRankTotal: 23, action: "raise" },
      { maxToCallMinor: 0, action: "check" },
    ],
    fallbackAction: "call",
  }));
  const cinder = compileStrategyAgent("CINDER", parseStrategyPolicy({
    schemaVersion: 1,
    displayName: "Cinder",
    rules: [
      { minHoleRankTotal: 25, action: "raise" },
      { maxToCallMinor: 0, action: "check" },
    ],
    fallbackAction: "fold",
  }));

  const result = runMatch({
    agents: [nightjar, cinder],
    ...matchInput,
  });
  if (!result.ok) {
    throw new Error(`ARENA_RELEASE_PROOF_FAILED:${result.code}:${result.agentId}:${result.handNumber}`);
  }
  return result.value;
}

export function buildProofReport() {
  const match = runReleaseProofMatch();
  const replay = runReleaseProofMatch();
  const firstReceipt = match.publicHandReceipts[0]!;
  const firstProof = transcriptProof(match.publicHandReceipts, 0);
  const changedReceipt = {
    ...firstReceipt,
    boardCommitment: commitment("changed-board-commitment"),
  };
  const publicEvidence = JSON.stringify({
    hands: match.publicHandReceipts,
    match: match.publicReceipt,
  });

  return {
    product: "Veil Arena",
    engineVersion: ARENA_ENGINE_VERSION,
    match: {
      matchId: match.matchId,
      pairedDeals: matchInput.hands,
      publicHandReceipts: match.publicHandReceipts.length,
      seatSwaps: match.publicHandReceipts.filter((receipt) => receipt.seatSwapped).length,
      score: match.score,
      artifactCommitments: match.publicReceipt.artifactCommitments,
      seedCommitment: match.seedCommitment,
      transcriptRoot: match.publicReceipt.transcriptRoot,
    },
    verification: {
      deterministicReplay: JSON.stringify(match.publicReceipt) === JSON.stringify(replay.publicReceipt),
      transcriptInclusion: verifyTranscriptProof(
        firstReceipt,
        firstProof,
        match.publicReceipt.transcriptRoot,
      ),
      tamperingRejected: !verifyTranscriptProof(
        changedReceipt,
        firstProof,
        match.publicReceipt.transcriptRoot,
      ),
      publicEvidenceOmitsHoleCards: !publicEvidence.includes("holeCards"),
      publicEvidenceOmitsStrategyRules: !publicEvidence.includes("fallbackAction")
        && !publicEvidence.includes("rules"),
      publicEvidenceOmitsRawSeed: !publicEvidence.includes(`\"seed\":`),
    },
    rewardBoundary: {
      settlement: "A sponsor authorizes a STRK20 private transfer to the winner wallet.",
      requiredExternalEvidence: [
        "the sponsor wallet signature over the exact settlement plan",
        "a successful Starknet finality receipt that directly touches the configured STRK20 pool",
      ],
    },
    limitations: [
      "This local report proves deterministic engine and transcript behavior.",
      "It does not replace a sponsor wallet signature or a Starknet finality receipt.",
      "The operator can decrypt sealed strategies while running a match, so the operator remains inside the privacy trust boundary.",
    ],
  };
}
