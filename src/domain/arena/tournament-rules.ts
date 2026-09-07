// No framework, storage, clock, or network imports belong here. The operator UI
// previews this module and the server uses the same functions to lock a roster.
import { commitment } from "@/domain/canonical";
import {
  ARENA_ENGINE_VERSION,
  SUPPORTED_ARENA_ENGINE_VERSIONS,
  type ArenaEngineVersion,
} from "@/domain/arena/poker-engine";
import { z } from "zod";

export const TOURNAMENT_RULES_SCHEMA_VERSION = 1 as const;
export const TOURNAMENT_TEMPLATE_VERSION = 3 as const;

export type TournamentTemplateId =
  | "friend_challenge"
  | "champion_challenge"
  | "playground"
  | "open_league"
  | "sponsored_open"
  | "duel_series"
  | "benchmark_gauntlet"
  | "championship"
  | "custom";

export type TournamentPairingMode = "round_robin" | "sampled_rounds" | "duel_series" | "gauntlet";
export type TournamentEntryMode = "open" | "invite_only";
export type TournamentEntryLimit = "capped" | "unlimited";
export type TournamentResubmissionPolicy = "replace_until_lock" | "fixed";
export type TournamentRewardPolicy = "optional" | "funded_before_start";
export type TournamentPaymentRail = "strk20";
export type TournamentScheduleMode = "timed_rounds";
export type TournamentRewardDistribution = "winner_takes_all" | "top_3" | "top_5" | "top_8" | "top_10";

export const TOURNAMENT_REWARD_PRESETS: Record<TournamentRewardDistribution, readonly number[]> = {
  winner_takes_all: [100],
  top_3: [50, 30, 20],
  top_5: [40, 25, 15, 10, 10],
  top_8: [30, 20, 15, 10, 8, 7, 5, 5],
  top_10: [25, 18, 14, 10, 8, 7, 6, 5, 4, 3],
};

export interface TournamentRules {
  schemaVersion: typeof TOURNAMENT_RULES_SCHEMA_VERSION;
  templateId: TournamentTemplateId;
  templateVersion: 1 | 2 | typeof TOURNAMENT_TEMPLATE_VERSION;
  duplicateStrategyPolicy?: "reject_exact";
  engineVersion: ArenaEngineVersion;
  pairingMode: TournamentPairingMode;
  entryMode: TournamentEntryMode;
  entryLimit?: TournamentEntryLimit;
  minEntries: number;
  maxEntries: number;
  handsPerMatch: number;
  encountersPerPair: number;
  scheduleMode?: TournamentScheduleMode;
  qualificationHands?: number;
  resubmissionPolicy: TournamentResubmissionPolicy;
  rewardPolicy: TournamentRewardPolicy;
  rewardDistribution?: TournamentRewardDistribution;
  paymentRail?: TournamentPaymentRail;
  revealPolicy: "loser_action_only";
  strategyVisibility: "sealed";
}

export interface CustomTournamentRulesInput {
  pairingMode: TournamentPairingMode;
  entryMode: TournamentEntryMode;
  entryLimit?: TournamentEntryLimit;
  maxEntries: number;
  handsPerMatch: number;
  encountersPerPair: number;
  resubmissionPolicy: TournamentResubmissionPolicy;
  rewardPolicy: TournamentRewardPolicy;
  rewardDistribution?: TournamentRewardDistribution;
  qualificationHands?: number;
}

export interface TournamentTemplateDefinition {
  id: TournamentTemplateId;
  group: "quick_start" | "advanced";
  name: string;
  summary: string;
  bestFor: string;
  rules?: TournamentRules;
}

export interface TournamentScheduleEntry {
  agentId: string;
  joinedAt: Date;
}

export interface TournamentPairing {
  sequence: number;
  leftAgentId: string;
  rightAgentId: string;
  hands: number;
  roundNumber?: number;
  scheduledFor?: Date;
}

export interface TournamentWorkload {
  entryCount: number;
  pairingCount: number;
  totalHands: number;
  roundCount?: number;
  decisionsPerAgent?: number;
  qualificationHands?: number;
}

const sharedPrivacyRules = {
  schemaVersion: TOURNAMENT_RULES_SCHEMA_VERSION,
  templateVersion: TOURNAMENT_TEMPLATE_VERSION,
  duplicateStrategyPolicy: "reject_exact",
  engineVersion: ARENA_ENGINE_VERSION,
  revealPolicy: "loser_action_only" as const,
  strategyVisibility: "sealed" as const,
  rewardDistribution: "winner_takes_all" as const,
} as const;

const tournamentRulesSchema = z.object({
  schemaVersion: z.literal(TOURNAMENT_RULES_SCHEMA_VERSION),
  templateId: z.enum(["friend_challenge", "champion_challenge", "playground", "open_league", "sponsored_open", "duel_series", "benchmark_gauntlet", "championship", "custom"]),
  templateVersion: z.union([z.literal(1), z.literal(2), z.literal(TOURNAMENT_TEMPLATE_VERSION)]),
  duplicateStrategyPolicy: z.literal("reject_exact").optional(),
  engineVersion: z.enum(SUPPORTED_ARENA_ENGINE_VERSIONS),
  pairingMode: z.enum(["round_robin", "sampled_rounds", "duel_series", "gauntlet"]),
  entryMode: z.enum(["open", "invite_only"]),
  entryLimit: z.enum(["capped", "unlimited"]).optional(),
  minEntries: z.number().int(),
  maxEntries: z.number().int(),
  handsPerMatch: z.number().int(),
  encountersPerPair: z.number().int(),
  scheduleMode: z.literal("timed_rounds").optional(),
  qualificationHands: z.number().int().optional(),
  resubmissionPolicy: z.enum(["replace_until_lock", "fixed"]),
  rewardPolicy: z.enum(["optional", "funded_before_start"]),
  rewardDistribution: z.enum(["winner_takes_all", "top_3", "top_5", "top_8", "top_10"]).optional(),
  paymentRail: z.literal("strk20").optional(),
  revealPolicy: z.literal("loser_action_only"),
  strategyVisibility: z.literal("sealed"),
}).strict();

const templates: Record<Exclude<TournamentTemplateId, "custom">, TournamentRules> = {
  friend_challenge: {
    ...sharedPrivacyRules,
    templateId: "friend_challenge",
    pairingMode: "duel_series",
    entryMode: "invite_only",
    minEntries: 2,
    maxEntries: 2,
    handsPerMatch: 20,
    encountersPerPair: 1,
    scheduleMode: "timed_rounds",
    qualificationHands: 400,
    resubmissionPolicy: "fixed",
    rewardPolicy: "optional",
  },
  champion_challenge: {
    ...sharedPrivacyRules,
    templateId: "champion_challenge",
    pairingMode: "duel_series",
    entryMode: "invite_only",
    minEntries: 2,
    maxEntries: 2,
    handsPerMatch: 20,
    encountersPerPair: 1,
    scheduleMode: "timed_rounds",
    qualificationHands: 1_000,
    resubmissionPolicy: "fixed",
    rewardPolicy: "optional",
  },
  playground: {
    ...sharedPrivacyRules,
    templateId: "playground",
    pairingMode: "sampled_rounds",
    entryMode: "open",
    entryLimit: "unlimited",
    minEntries: 2,
    maxEntries: 8,
    handsPerMatch: 12,
    encountersPerPair: 1,
    scheduleMode: "timed_rounds",
    qualificationHands: 500,
    resubmissionPolicy: "replace_until_lock",
    rewardPolicy: "optional",
  },
  open_league: {
    ...sharedPrivacyRules,
    templateId: "open_league",
    pairingMode: "sampled_rounds",
    entryMode: "open",
    entryLimit: "unlimited",
    minEntries: 4,
    maxEntries: 16,
    handsPerMatch: 20,
    encountersPerPair: 1,
    scheduleMode: "timed_rounds",
    qualificationHands: 5_000,
    resubmissionPolicy: "replace_until_lock",
    rewardPolicy: "optional",
  },
  sponsored_open: {
    ...sharedPrivacyRules,
    templateId: "sponsored_open",
    pairingMode: "sampled_rounds",
    entryMode: "open",
    entryLimit: "unlimited",
    minEntries: 4,
    maxEntries: 16,
    handsPerMatch: 20,
    encountersPerPair: 1,
    scheduleMode: "timed_rounds",
    qualificationHands: 20_000,
    resubmissionPolicy: "replace_until_lock",
    rewardPolicy: "optional",
    paymentRail: "strk20",
  },
  duel_series: {
    ...sharedPrivacyRules,
    templateId: "duel_series",
    pairingMode: "duel_series",
    entryMode: "open",
    minEntries: 2,
    maxEntries: 2,
    handsPerMatch: 20,
    encountersPerPair: 1,
    scheduleMode: "timed_rounds",
    qualificationHands: 2_000,
    resubmissionPolicy: "replace_until_lock",
    rewardPolicy: "optional",
  },
  benchmark_gauntlet: {
    ...sharedPrivacyRules,
    templateId: "benchmark_gauntlet",
    pairingMode: "gauntlet",
    entryMode: "invite_only",
    minEntries: 3,
    maxEntries: 16,
    handsPerMatch: 20,
    encountersPerPair: 1,
    scheduleMode: "timed_rounds",
    qualificationHands: 2_000,
    resubmissionPolicy: "fixed",
    rewardPolicy: "optional",
  },
  championship: {
    ...sharedPrivacyRules,
    templateId: "championship",
    pairingMode: "round_robin",
    entryMode: "invite_only",
    minEntries: 4,
    maxEntries: 8,
    handsPerMatch: 20,
    encountersPerPair: 1,
    scheduleMode: "timed_rounds",
    qualificationHands: 20_000,
    resubmissionPolicy: "fixed",
    rewardPolicy: "funded_before_start",
    paymentRail: "strk20",
  },
};

export const TOURNAMENT_TEMPLATES: readonly TournamentTemplateDefinition[] = [
  {
    id: "friend_challenge",
    group: "quick_start",
    name: "Friend challenge",
    summary: "A private two-agent competition with timed rounds and one expiring entry link.",
    bestFor: "Challenge someone you know",
    rules: templates.friend_challenge,
  },
  {
    id: "playground",
    group: "quick_start",
    name: "Public freepass",
    summary: "A public season where agents enter before lock and meet in repeated scheduled rounds.",
    bestFor: "Fast demos and first competitions",
    rules: templates.playground,
  },
  {
    id: "sponsored_open",
    group: "quick_start",
    name: "Sponsored open",
    summary: "A timed public league with a private sponsor reward and ranked payout options.",
    bestFor: "Open funded competitions",
    rules: templates.sponsored_open,
  },
  {
    id: "open_league",
    group: "advanced",
    name: "Open league",
    summary: "A public long season with sampled rounds until the season locks.",
    bestFor: "Community competitions",
    rules: templates.open_league,
  },
  {
    id: "duel_series",
    group: "advanced",
    name: "Duel series",
    summary: "Two agents play scheduled receipted matches throughout the competition window.",
    bestFor: "Head-to-head challenges",
    rules: templates.duel_series,
  },
  {
    id: "benchmark_gauntlet",
    group: "advanced",
    name: "Benchmark gauntlet",
    summary: "Every challenger faces one operator-selected sealed benchmark agent.",
    bestFor: "Agent evaluation",
    rules: templates.benchmark_gauntlet,
  },
  {
    id: "championship",
    group: "advanced",
    name: "Championship",
    summary: "An invite-only round robin with funding required before play begins.",
    bestFor: "Guaranteed prize events",
    rules: templates.championship,
  },
  {
    id: "custom",
    group: "advanced",
    name: "Custom",
    summary: "Combine approved pairing, admission, funding, and replacement rules.",
    bestFor: "Operators who need precise control",
  },
] as const;

function validateRules(rules: TournamentRules): TournamentRules {
  const exactDuel = rules.pairingMode === "duel_series"
    ? rules.minEntries === 2 && rules.maxEntries === 2
    : true;
  const sampledRounds = rules.pairingMode === "sampled_rounds"
    ? rules.entryMode === "open" && rules.entryLimit === "unlimited"
    : true;
  const validReplacement = rules.resubmissionPolicy === "fixed" || rules.entryMode === "open";
  const validVersionedRules = rules.templateVersion === 3
    ? rules.duplicateStrategyPolicy === "reject_exact"
      && rules.scheduleMode === "timed_rounds"
      && Number.isInteger(rules.qualificationHands)
      && (rules.qualificationHands ?? 0) >= 40
      && (rules.qualificationHands ?? 0) <= 100_000
    : rules.scheduleMode === undefined
      && rules.qualificationHands === undefined
      && (rules.templateVersion === 2
        ? rules.duplicateStrategyPolicy === "reject_exact"
        : rules.duplicateStrategyPolicy === undefined);
  if (
    !validVersionedRules
    || !Number.isInteger(rules.minEntries)
    || !Number.isInteger(rules.maxEntries)
    || rules.minEntries < 2
    || rules.maxEntries > 32
    || rules.minEntries > rules.maxEntries
    || !Number.isInteger(rules.handsPerMatch)
    || rules.handsPerMatch < 1
    || rules.handsPerMatch > 100
    || !Number.isInteger(rules.encountersPerPair)
    || rules.encountersPerPair < 1
    || rules.encountersPerPair > 5
    || !exactDuel
    || !sampledRounds
    || !validReplacement
  ) {
    throw new Error("TOURNAMENT_RULES_INVALID");
  }
  return rules;
}

export function usesStrk20RewardRail(rules: TournamentRules): boolean {
  return rules.paymentRail === "strk20" || rules.rewardPolicy === "funded_before_start";
}

export function parseTournamentRules(value: unknown): TournamentRules {
  const parsed = tournamentRulesSchema.safeParse(value);
  if (!parsed.success) throw new Error("TOURNAMENT_RULES_INVALID");
  return validateRules(parsed.data);
}

export function resolveTournamentRules(input: {
  templateId: TournamentTemplateId;
  custom?: CustomTournamentRulesInput;
  qualificationHands?: number;
  rewardDistribution?: TournamentRewardDistribution;
}): TournamentRules {
  if (input.templateId !== "custom") {
    const rules = structuredClone(templates[input.templateId]);
    if (input.qualificationHands !== undefined) rules.qualificationHands = input.qualificationHands;
    if (input.rewardDistribution !== undefined) rules.rewardDistribution = input.rewardDistribution;
    return validateRules(rules);
  }
  if (!input.custom) throw new Error("CUSTOM_TOURNAMENT_RULES_REQUIRED");
  const minEntries = input.custom.pairingMode === "duel_series" ? 2 : input.custom.pairingMode === "gauntlet" ? 3 : 2;
  const maxEntries = input.custom.pairingMode === "duel_series" ? 2 : input.custom.maxEntries;
  return validateRules({
    ...sharedPrivacyRules,
    templateId: "custom",
    pairingMode: input.custom.pairingMode,
    entryMode: input.custom.entryMode,
    entryLimit: input.custom.entryLimit ?? "capped",
    minEntries,
    maxEntries,
    handsPerMatch: input.custom.handsPerMatch,
    encountersPerPair: input.custom.encountersPerPair,
    scheduleMode: "timed_rounds",
    qualificationHands: input.custom.qualificationHands ?? input.qualificationHands ?? 1_000,
    resubmissionPolicy: input.custom.resubmissionPolicy,
    rewardPolicy: input.custom.rewardPolicy,
    rewardDistribution: input.custom.rewardDistribution ?? input.rewardDistribution ?? "winner_takes_all",
    ...(input.custom.rewardPolicy === "funded_before_start" ? { paymentRail: "strk20" as const } : {}),
  });
}

export function tournamentRulesCommitment(rules: TournamentRules): string {
  return commitment(validateRules(rules));
}

function orderedEntries(entries: TournamentScheduleEntry[]): TournamentScheduleEntry[] {
  const seen = new Set<string>();
  const ordered = [...entries].sort((left, right) => (
    left.joinedAt.getTime() - right.joinedAt.getTime() || left.agentId.localeCompare(right.agentId)
  ));
  for (const entry of ordered) {
    if (!entry.agentId || seen.has(entry.agentId)) throw new Error("TOURNAMENT_ENTRY_INVALID");
    seen.add(entry.agentId);
  }
  return ordered;
}

export function buildTournamentSchedule(input: {
  rules: TournamentRules;
  entries: TournamentScheduleEntry[];
  benchmarkAgentId?: string;
  startsAt?: Date;
  endsAt?: Date;
}): TournamentPairing[] {
  const rules = validateRules(input.rules);
  const entries = orderedEntries(input.entries);
  if (entries.length < rules.minEntries || (rules.entryLimit !== "unlimited" && entries.length > rules.maxEntries)) {
    throw new Error("TOURNAMENT_ROSTER_SIZE_INVALID");
  }

  const basePairs: Array<[TournamentScheduleEntry, TournamentScheduleEntry]> = [];
  if (rules.pairingMode === "gauntlet") {
    const benchmark = entries.find((entry) => entry.agentId === input.benchmarkAgentId);
    if (!benchmark) throw new Error("TOURNAMENT_BENCHMARK_REQUIRED");
    for (const challenger of entries) {
      if (challenger.agentId !== benchmark.agentId) basePairs.push([benchmark, challenger]);
    }
  } else if (rules.pairingMode !== "sampled_rounds") {
    for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
        basePairs.push([entries[leftIndex], entries[rightIndex]]);
      }
    }
  }

  const pairings: TournamentPairing[] = [];
  const timed = rules.templateVersion === 3;
  const startsAt = input.startsAt;
  const endsAt = input.endsAt;
  if (timed && (!startsAt || !endsAt || !Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || startsAt >= endsAt)) {
    throw new Error("TOURNAMENT_WINDOW_INVALID");
  }
  const decisionsPerAgentPerRound = rules.pairingMode === "gauntlet" || rules.pairingMode === "sampled_rounds"
    ? rules.handsPerMatch * 2
    : Math.max(1, entries.length - 1) * rules.handsPerMatch * 2;
  const roundCount = timed
    ? Math.ceil((rules.qualificationHands ?? decisionsPerAgentPerRound) / decisionsPerAgentPerRound)
    : rules.encountersPerPair;
  let sequence = 1;
  for (let encounter = 0; encounter < roundCount; encounter += 1) {
    const scheduledFor = timed && startsAt && endsAt
      ? new Date(startsAt.getTime() + Math.floor(((endsAt.getTime() - startsAt.getTime()) * encounter) / roundCount))
      : undefined;
    const roundPairs = rules.pairingMode === "sampled_rounds"
      ? shuffledRoundEntries(entries, encounter + 1)
        .slice(0, entries.length - (entries.length % 2))
        .reduce<Array<[TournamentScheduleEntry, TournamentScheduleEntry]>>((pairs, entry, index, roundEntries) => {
          if (index % 2 === 0) pairs.push([entry, roundEntries[index + 1]!]);
          return pairs;
        }, [])
      : basePairs;
    for (const [first, second] of roundPairs) {
      const swap = encounter % 2 === 1;
      pairings.push({
        sequence,
        leftAgentId: swap ? second.agentId : first.agentId,
        rightAgentId: swap ? first.agentId : second.agentId,
        hands: rules.handsPerMatch,
        ...(timed ? { roundNumber: encounter + 1, scheduledFor } : {}),
      });
      sequence += 1;
    }
  }
  return pairings;
}

export function estimateTournamentWorkload(input: {
  rules: TournamentRules;
  entryCount: number;
}): TournamentWorkload {
  const rules = validateRules(input.rules);
  if (!Number.isInteger(input.entryCount) || input.entryCount < rules.minEntries || (rules.entryLimit !== "unlimited" && input.entryCount > rules.maxEntries)) {
    throw new Error("TOURNAMENT_ROSTER_SIZE_INVALID");
  }
  const basePairings = rules.pairingMode === "gauntlet"
    ? input.entryCount - 1
    : rules.pairingMode === "sampled_rounds"
      ? Math.floor(input.entryCount / 2)
    : (input.entryCount * (input.entryCount - 1)) / 2;
  const decisionsPerAgentPerRound = rules.pairingMode === "gauntlet" || rules.pairingMode === "sampled_rounds"
    ? rules.handsPerMatch * 2
    : Math.max(1, input.entryCount - 1) * rules.handsPerMatch * 2;
  const roundCount = rules.templateVersion === 3
    ? Math.ceil((rules.qualificationHands ?? decisionsPerAgentPerRound) / decisionsPerAgentPerRound)
    : rules.encountersPerPair;
  const pairingCount = basePairings * roundCount;
  return {
    entryCount: input.entryCount,
    pairingCount,
    totalHands: pairingCount * rules.handsPerMatch,
    ...(rules.templateVersion === 3 ? {
      roundCount,
      decisionsPerAgent: roundCount * decisionsPerAgentPerRound,
      qualificationHands: rules.qualificationHands,
    } : {}),
  };
}

function shuffledRoundEntries(entries: TournamentScheduleEntry[], roundNumber: number): TournamentScheduleEntry[] {
  return [...entries].sort((left, right) => {
    const leftKey = commitment({ roundNumber, agentId: left.agentId });
    const rightKey = commitment({ roundNumber, agentId: right.agentId });
    return leftKey.localeCompare(rightKey) || left.agentId.localeCompare(right.agentId);
  });
}

export function rewardPercentages(rules: TournamentRules): readonly number[] {
  return TOURNAMENT_REWARD_PRESETS[rules.rewardDistribution ?? "winner_takes_all"];
}
