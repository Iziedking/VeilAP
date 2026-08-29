import { runMatch, type PublicMatchReceipt } from "@/domain/arena/poker-engine";
import { openStrategyArtifact, type StrategyArtifactStore } from "@/server/arena/strategy-artifacts";
import type { ProjectKeyMaterial } from "@/server/crypto/key-provider";

export type SealedMatchRunResult =
  | {
      ok: true;
      value: {
        publicReceipt: PublicMatchReceipt;
        decisionCount: number;
      };
    }
  | {
      ok: false;
      code: "SEALED_ARTIFACT_NOT_FOUND" | "STRATEGY_ARTIFACT_INVALID" | "AGENT_POLICY_FAILED" | "ILLEGAL_AGENT_ACTION";
      agentId?: string;
      handNumber?: number;
    };

export async function runSealedMatch(input: {
  projectId: string;
  leftAgentId: string;
  rightAgentId: string;
  matchId: string;
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

  const result = runMatch({
    agents: [left.agent, right.agent],
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
      decisionCount: result.value.hands.length,
    },
  };
}
