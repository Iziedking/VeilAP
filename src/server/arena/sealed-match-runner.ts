import { commitment } from "@/domain/canonical";
import {
  runMatch,
  transcriptProof,
  verifyTranscriptProof,
  type DecisionAction,
  type ArenaEngineVersion,
  type MatchResult,
  type PublicHandReceipt,
  type PublicMatchReceipt,
  type TranscriptProof,
} from "@/domain/arena/poker-engine";
import { strategyPayloadEngineVersion, strategyPayloadSupportsEngine } from "@/domain/arena/strategy-policy";
import { openStrategyArtifact, type StrategyArtifactStore } from "@/server/arena/strategy-artifacts";
import type { ProjectKeyMaterial } from "@/server/crypto/key-provider";

export type SealedMatchRunResult =
  | {
      ok: true;
      value: {
        publicReceipt: PublicMatchReceipt;
        publicHandReceipts: readonly PublicHandReceipt[];
        hands: MatchResult["hands"];
        decisionCount: number;
      };
    }
  | {
      ok: false;
      code: "SEALED_ARTIFACT_NOT_FOUND" | "STRATEGY_ARTIFACT_INVALID" | "AGENT_ENGINE_MISMATCH" | "AGENT_POLICY_FAILED" | "ILLEGAL_AGENT_ACTION";
      agentId?: string;
      handNumber?: number;
    };

export type SealedLosingActionReveal = Readonly<{
  action: DecisionAction;
  actionCommitment: string;
  agentId: string;
  handCommitment: string;
  handIndex: number;
  handNumber: number;
  position: "button" | "big_blind";
  proof: TranscriptProof;
  publicHandReceipt: PublicHandReceipt;
  seatSwapped: boolean;
  transcriptRoot: string;
}>;

export type SealedLosingActionRevealResult =
  | { ok: true; value: SealedLosingActionReveal }
  | {
      ok: false;
      code:
        | "SEALED_ARTIFACT_NOT_FOUND"
        | "STRATEGY_ARTIFACT_INVALID"
        | "AGENT_ENGINE_MISMATCH"
        | "AGENT_POLICY_FAILED"
        | "ILLEGAL_AGENT_ACTION"
        | "REVEAL_HAND_NOT_FOUND"
        | "NO_LOSING_AGENT"
        | "TRANSCRIPT_PROOF_INVALID";
      agentId?: string;
      handNumber?: number;
    };

export async function runSealedMatch(input: {
  projectId: string;
  leftAgentId: string;
  rightAgentId: string;
  matchId: string;
  engineVersion?: ArenaEngineVersion;
  seed: string;
  hands: number;
  keyMaterial: ProjectKeyMaterial;
  store: StrategyArtifactStore;
}): Promise<SealedMatchRunResult> {
  const [leftRecord, rightRecord] = await Promise.all([
    input.store.get(input.projectId, input.leftAgentId),
    input.store.get(input.projectId, input.rightAgentId),
  ]);
  if (!leftRecord) return { ok: false, code: "SEALED_ARTIFACT_NOT_FOUND", agentId: input.leftAgentId };
  if (!rightRecord) return { ok: false, code: "SEALED_ARTIFACT_NOT_FOUND", agentId: input.rightAgentId };

  let left;
  let right;
  try {
    [left, right] = await Promise.all([
      openStrategyArtifact({ record: leftRecord, keyMaterial: input.keyMaterial }),
      openStrategyArtifact({ record: rightRecord, keyMaterial: input.keyMaterial }),
    ]);
  } catch {
    return { ok: false, code: "STRATEGY_ARTIFACT_INVALID" };
  }
  const engineVersion = input.engineVersion ?? strategyPayloadEngineVersion(left.policy);
  if (
    !strategyPayloadSupportsEngine(left.policy, engineVersion)
    || !strategyPayloadSupportsEngine(right.policy, engineVersion)
  ) return { ok: false, code: "AGENT_ENGINE_MISMATCH" };

  const result = runMatch({
    agents: [left.agent, right.agent],
    engineVersion,
    hands: input.hands,
    matchId: input.matchId,
    seed: input.seed,
  });
  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      agentId: result.agentId,
      handNumber: result.handNumber,
    };
  }

  return {
    ok: true,
    value: {
      publicReceipt: result.value.publicReceipt,
      publicHandReceipts: result.value.publicHandReceipts,
      hands: result.value.hands,
      decisionCount: result.value.hands.length,
    },
  };
}

export async function revealSealedLosingAction(input: {
  projectId: string;
  leftAgentId: string;
  rightAgentId: string;
  matchId: string;
  engineVersion?: ArenaEngineVersion;
  seed: string;
  hands: number;
  handIndex: number;
  keyMaterial: ProjectKeyMaterial;
  store: StrategyArtifactStore;
}): Promise<SealedLosingActionRevealResult> {
  const [leftRecord, rightRecord] = await Promise.all([
    input.store.get(input.projectId, input.leftAgentId),
    input.store.get(input.projectId, input.rightAgentId),
  ]);
  if (!leftRecord) return { ok: false, code: "SEALED_ARTIFACT_NOT_FOUND", agentId: input.leftAgentId };
  if (!rightRecord) return { ok: false, code: "SEALED_ARTIFACT_NOT_FOUND", agentId: input.rightAgentId };

  let left;
  let right;
  try {
    [left, right] = await Promise.all([
      openStrategyArtifact({ record: leftRecord, keyMaterial: input.keyMaterial }),
      openStrategyArtifact({ record: rightRecord, keyMaterial: input.keyMaterial }),
    ]);
  } catch {
    return { ok: false, code: "STRATEGY_ARTIFACT_INVALID" };
  }
  const engineVersion = input.engineVersion ?? strategyPayloadEngineVersion(left.policy);
  if (
    !strategyPayloadSupportsEngine(left.policy, engineVersion)
    || !strategyPayloadSupportsEngine(right.policy, engineVersion)
  ) return { ok: false, code: "AGENT_ENGINE_MISMATCH" };

  const result = runMatch({
    agents: [left.agent, right.agent],
    engineVersion,
    hands: input.hands,
    matchId: input.matchId,
    seed: input.seed,
  });
  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      agentId: result.agentId,
      handNumber: result.handNumber,
    };
  }

  const scoreEntries = Object.entries(result.value.score);
  const highest = Math.max(...scoreEntries.map(([, score]) => score));
  const winners = scoreEntries.filter(([, score]) => score === highest);
  if (winners.length !== 1) return { ok: false, code: "NO_LOSING_AGENT" };
  const winner = winners[0]![0];
  const loser = scoreEntries.find(([agentId]) => agentId !== winner)?.[0];
  if (!loser) return { ok: false, code: "NO_LOSING_AGENT" };

  if (!Number.isSafeInteger(input.handIndex) || input.handIndex < 1 || input.handIndex > result.value.publicHandReceipts.length) {
    return { ok: false, code: "REVEAL_HAND_NOT_FOUND" };
  }
  const receiptIndex = input.handIndex - 1;
  const publicHandReceipt = result.value.publicHandReceipts[receiptIndex]!;
  const hand = result.value.hands[receiptIndex]!;
  const outcome = hand.outcomes.find((candidate) => candidate.agentId === loser);
  if (!outcome) return { ok: false, code: "NO_LOSING_AGENT" };
  const actionCommitment = commitment({ agentId: outcome.agentId, action: outcome.action });
  if (publicHandReceipt.actionCommitments[loser] !== actionCommitment) {
    return { ok: false, code: "TRANSCRIPT_PROOF_INVALID" };
  }
  const proof = transcriptProof(result.value.publicHandReceipts, receiptIndex);
  if (!verifyTranscriptProof(publicHandReceipt, proof, result.value.publicReceipt.transcriptRoot)) {
    return { ok: false, code: "TRANSCRIPT_PROOF_INVALID" };
  }

  return {
    ok: true,
    value: {
      action: outcome.action,
      actionCommitment,
      agentId: outcome.agentId,
      handCommitment: publicHandReceipt.handCommitment,
      handIndex: input.handIndex,
      handNumber: outcome.handNumber,
      position: outcome.position,
      proof,
      publicHandReceipt,
      seatSwapped: outcome.seatSwapped,
      transcriptRoot: result.value.publicReceipt.transcriptRoot,
    },
  };
}
