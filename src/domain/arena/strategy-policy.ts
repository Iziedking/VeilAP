import { z } from "zod";

import {
  ARENA_ENGINE_VERSION,
  evaluateHand,
  type AgentDefinition,
  type AgentPolicy,
  type DecisionAction,
  type HandCategory,
} from "@/domain/arena/poker-engine";
import { commitment } from "@/domain/canonical";

export const STRATEGY_POLICY_SCHEMA_VERSION = 1 as const;
export const AGENT_PACKAGE_PROTOCOL_VERSION = "veil-agent.v1" as const;

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

const handCategorySchema = z.enum([
  "high_card",
  "pair",
  "two_pair",
  "three_kind",
  "straight",
  "flush",
  "full_house",
  "four_kind",
  "straight_flush",
]);

const cadenceSchema = z.object({
  divisor: z.number().int().min(2).max(100),
  remainder: z.number().int().min(0).max(99),
}).strict().refine((value) => value.remainder < value.divisor, "AGENT_CADENCE_INVALID");

const agentConditionSchema = z.object({
  handCategories: z.array(handCategorySchema).min(1).max(9).optional(),
  minHandStrength: z.number().int().min(0).max(8).optional(),
  maxHandStrength: z.number().int().min(0).max(8).optional(),
  minHoleRankTotal: z.number().int().min(4).max(28).optional(),
  maxHoleRankTotal: z.number().int().min(4).max(28).optional(),
  minHighCardRank: z.number().int().min(2).max(14).optional(),
  maxHighCardRank: z.number().int().min(2).max(14).optional(),
  pocketPair: z.boolean().optional(),
  suited: z.boolean().optional(),
  position: z.enum(["button", "big_blind"]).optional(),
  boardPaired: z.boolean().optional(),
  minBoardSuitCount: z.number().int().min(1).max(5).optional(),
  maxToCallMinor: z.number().int().min(0).max(1_000_000_000).optional(),
  handNumberModulo: cadenceSchema.optional(),
}).strict().refine((condition) => Object.values(condition).some((value) => value !== undefined), {
  message: "AGENT_RULE_NEEDS_CONDITION",
}).refine((condition) => (
  condition.minHandStrength === undefined
  || condition.maxHandStrength === undefined
  || condition.minHandStrength <= condition.maxHandStrength
), { message: "AGENT_HAND_STRENGTH_RANGE_INVALID" }).refine((condition) => (
  condition.minHoleRankTotal === undefined
  || condition.maxHoleRankTotal === undefined
  || condition.minHoleRankTotal <= condition.maxHoleRankTotal
), { message: "AGENT_HOLE_RANGE_INVALID" }).refine((condition) => (
  condition.minHighCardRank === undefined
  || condition.maxHighCardRank === undefined
  || condition.minHighCardRank <= condition.maxHighCardRank
), { message: "AGENT_HIGH_CARD_RANGE_INVALID" });

const agentRuleSchema = z.object({
  when: agentConditionSchema,
  action: decisionActionSchema,
}).strict();

export const agentPackageSchema = z.object({
  protocolVersion: z.literal(AGENT_PACKAGE_PROTOCOL_VERSION),
  engineVersion: z.literal(ARENA_ENGINE_VERSION),
  agentId: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/),
  displayName: z.string().trim().min(1).max(80),
  policy: z.object({
    rules: z.array(agentRuleSchema).min(1).max(64),
    fallbackAction: decisionActionSchema,
  }).strict(),
}).strict();

export type AgentPackage = z.infer<typeof agentPackageSchema>;
export type StrategyArtifactPayload = StrategyPolicy | AgentPackage;

export function parseStrategyPolicy(input: unknown): StrategyPolicy {
  const result = strategyPolicySchema.safeParse(input);
  if (!result.success) throw new Error("STRATEGY_POLICY_INVALID");
  return result.data;
}

export function parseAgentPackage(input: unknown): AgentPackage {
  const result = agentPackageSchema.safeParse(input);
  if (!result.success) throw new Error("AGENT_PACKAGE_INVALID");
  return result.data;
}

export function parseStrategyArtifactPayload(input: unknown): StrategyArtifactPayload {
  if (input && typeof input === "object" && "protocolVersion" in input) return parseAgentPackage(input);
  return parseStrategyPolicy(input);
}

export function strategyArtifactCommitment(policy: StrategyPolicy): string {
  return commitment({
    policy,
    schemaVersion: STRATEGY_POLICY_SCHEMA_VERSION,
  });
}

export function agentPackageCommitment(agentPackage: AgentPackage): string {
  return commitment({
    agentPackage,
    protocolVersion: AGENT_PACKAGE_PROTOCOL_VERSION,
  });
}

export function strategyPayloadCommitment(payload: StrategyArtifactPayload): string {
  return "protocolVersion" in payload
    ? agentPackageCommitment(payload)
    : strategyArtifactCommitment(payload);
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

function maxSuitCount(cards: readonly { suit: string }[]): number {
  const counts = new Map<string, number>();
  for (const card of cards) counts.set(card.suit, (counts.get(card.suit) ?? 0) + 1);
  return Math.max(0, ...counts.values());
}

function boardIsPaired(cards: readonly { rank: number }[]): boolean {
  return new Set(cards.map((card) => card.rank)).size < cards.length;
}

function conditionMatches(
  condition: AgentPackage["policy"]["rules"][number]["when"],
  state: Parameters<AgentPolicy>[0],
  category: HandCategory,
): boolean {
  const [first, second] = state.holeCards;
  const holeRankTotal = first.rank + second.rank;
  const highCardRank = Math.max(first.rank, second.rank);
  const categories = condition.handCategories as readonly HandCategory["name"][] | undefined;
  return (
    (categories === undefined || categories.includes(category.name))
    && (condition.minHandStrength === undefined || category.rank >= condition.minHandStrength)
    && (condition.maxHandStrength === undefined || category.rank <= condition.maxHandStrength)
    && (condition.minHoleRankTotal === undefined || holeRankTotal >= condition.minHoleRankTotal)
    && (condition.maxHoleRankTotal === undefined || holeRankTotal <= condition.maxHoleRankTotal)
    && (condition.minHighCardRank === undefined || highCardRank >= condition.minHighCardRank)
    && (condition.maxHighCardRank === undefined || highCardRank <= condition.maxHighCardRank)
    && (condition.pocketPair === undefined || (first.rank === second.rank) === condition.pocketPair)
    && (condition.suited === undefined || (first.suit === second.suit) === condition.suited)
    && (condition.position === undefined || state.position === condition.position)
    && (condition.boardPaired === undefined || boardIsPaired(state.board) === condition.boardPaired)
    && (condition.minBoardSuitCount === undefined || maxSuitCount(state.board) >= condition.minBoardSuitCount)
    && (condition.maxToCallMinor === undefined || state.toCallMinor <= condition.maxToCallMinor)
    && (condition.handNumberModulo === undefined
      || state.handNumber % condition.handNumberModulo.divisor === condition.handNumberModulo.remainder)
  );
}

export function compileAgentPackage(agentPackage: AgentPackage): AgentDefinition {
  const parsed = parseAgentPackage(agentPackage);
  return {
    id: parsed.agentId,
    artifactCommitment: agentPackageCommitment(parsed),
    policy: (state) => {
      const category = evaluateHand([...state.holeCards, ...state.board]);
      const matchedRule = parsed.policy.rules.find((rule) => conditionMatches(rule.when, state, category));
      return legalFallback(state.legalActions, matchedRule?.action ?? parsed.policy.fallbackAction);
    },
  };
}

export function compileStrategyArtifactPayload(
  agentId: string,
  payload: StrategyArtifactPayload,
): AgentDefinition {
  return "protocolVersion" in payload
    ? compileAgentPackage(payload)
    : compileStrategyAgent(agentId, payload);
}

export function strategyPayloadDisplayName(payload: StrategyArtifactPayload): string {
  return payload.displayName;
}
