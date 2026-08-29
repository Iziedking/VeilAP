import { z } from "zod";

import type { AgentDefinition, AgentPolicy, DecisionAction } from "@/domain/arena/poker-engine";
import { commitment } from "@/domain/canonical";

export const STRATEGY_POLICY_SCHEMA_VERSION = 1 as const;

const decisionActionSchema = z.enum(["fold", "check", "call", "raise"]);

const strategyRuleSchema = z.object({
  minHoleRankTotal: z.number().int().min(4).max(28).optional(),
  maxToCallMinor: z.number().int().min(0).max(1_000_000_000).optional(),
  minBoardCards: z.number().int().min(0).max(5).optional(),
  action: decisionActionSchema,
}).strict().refine(
  (rule) => rule.minHoleRankTotal !== undefined || rule.maxToCallMinor !== undefined || rule.minBoardCards !== undefined,
  "STRATEGY_RULE_NEEDS_CONDITION",
);

export const strategyPolicySchema = z.object({
  schemaVersion: z.literal(STRATEGY_POLICY_SCHEMA_VERSION),
  displayName: z.string().trim().min(1).max(80),
  rules: z.array(strategyRuleSchema).min(1).max(32),
  fallbackAction: decisionActionSchema,
}).strict();

export type StrategyPolicy = z.infer<typeof strategyPolicySchema>;

export function parseStrategyPolicy(input: unknown): StrategyPolicy {
  const result = strategyPolicySchema.safeParse(input);
  if (!result.success) throw new Error("STRATEGY_POLICY_INVALID");
  return result.data;
}

export function strategyArtifactCommitment(policy: StrategyPolicy): string {
  return commitment({
    policy,
    schemaVersion: STRATEGY_POLICY_SCHEMA_VERSION,
  });
}

function legalFallback(legalActions: readonly DecisionAction[], preferred: DecisionAction): DecisionAction {
  if (legalActions.includes(preferred)) return preferred;
  for (const action of ["check", "call", "fold"] as const) {
    if (legalActions.includes(action)) return action;
  }
  throw new Error("STRATEGY_NO_LEGAL_ACTION");
}

export function compileStrategyPolicy(policy: StrategyPolicy): AgentPolicy {
  return (state) => {
    const holeRankTotal = state.holeCards[0].rank + state.holeCards[1].rank;
    const matchedRule = policy.rules.find((rule) => (
      (rule.minHoleRankTotal === undefined || holeRankTotal >= rule.minHoleRankTotal)
      && (rule.maxToCallMinor === undefined || state.toCallMinor <= rule.maxToCallMinor)
      && (rule.minBoardCards === undefined || state.board.length >= rule.minBoardCards)
    ));
    return legalFallback(state.legalActions, matchedRule?.action ?? policy.fallbackAction);
  };
}

export function compileStrategyAgent(agentId: string, policy: StrategyPolicy): AgentDefinition {
  const id = agentId.trim();
  if (id.length < 1 || id.length > 80) throw new Error("STRATEGY_AGENT_ID_INVALID");
  return {
    id,
    artifactCommitment: strategyArtifactCommitment(policy),
    policy: compileStrategyPolicy(policy),
  };
}
