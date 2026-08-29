import { commitment } from "@/domain/canonical";
import {
  evaluateHand,
  runMatch,
  type AgentDefinition,
  type DecisionState,
  type MatchResult,
} from "@/domain/arena/poker-engine";

function benchmarkPolicy(state: DecisionState) {
  const strength = evaluateHand([...state.holeCards, ...state.board]);
  if (strength.rank >= 5) return "raise" as const;
  if (strength.rank <= 1 && state.toCallMinor > 0) return "fold" as const;
  return "call" as const;
}

function cautiousBenchmarkPolicy(state: DecisionState) {
  const strength = evaluateHand([...state.holeCards, ...state.board]);
  if (strength.rank >= 6) return "raise" as const;
  if (strength.rank === 0 && state.toCallMinor > 0) return "fold" as const;
  return "call" as const;
}

const agents: readonly [AgentDefinition, AgentDefinition] = [
  { artifactCommitment: commitment("veil-arena-preview-nightjar-v1"), id: "NIGHTJAR", policy: benchmarkPolicy },
  { artifactCommitment: commitment("veil-arena-preview-cinder-v1"), id: "CINDER", policy: cautiousBenchmarkPolicy },
];

const result = runMatch({ agents, hands: 18, matchId: "M-031", seed: "veil-arena-season-00-preview" });

if (!result.ok) throw new Error(`PREVIEW_MATCH_FAILED:${result.code}:${result.agentId}:${result.handNumber}`);

export const previewMatch: MatchResult = result.value;

export const previewReceiptRoot = `${previewMatch.publicReceipt.transcriptRoot.slice(0, 8)}...${previewMatch.publicReceipt.transcriptRoot.slice(-4)}`;
