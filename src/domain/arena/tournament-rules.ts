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

export type TournamentPairingMode = "round_robin" | "duel_series" | "gauntlet";
export type TournamentEntryMode = "open" | "invite_only";
export type TournamentResubmissionPolicy = "replace_until_lock" | "fixed";
export type TournamentRewardPolicy = "optional" | "funded_before_start";
export type TournamentScheduleMode = "timed_rounds";

export interface TournamentRules {
  schemaVersion: typeof TOURNAMENT_RULES_SCHEMA_VERSION;
  templateId: TournamentTemplateId;
  templateVersion: 1 | 2 | typeof TOURNAMENT_TEMPLATE_VERSION;
  duplicateStrategyPolicy?: "reject_exact";
  engineVersion: ArenaEngineVersion;
  pairingMode: TournamentPairingMode;
  entryMode: TournamentEntryMode;
  minEntries: number;
  maxEntries: number;
  handsPerMatch: number;
  encountersPerPair: number;
  scheduleMode?: TournamentScheduleMode;
  qualificationHands?: number;
  resubmissionPolicy: TournamentResubmissionPolicy;
  rewardPolicy: TournamentRewardPolicy;
  revealPolicy: "loser_action_only";
  strategyVisibility: "sealed";
}

export interface CustomTournamentRulesInput {
  pairingMode: TournamentPairingMode;
  entryMode: TournamentEntryMode;
  maxEntries: number;
  handsPerMatch: number;
  encountersPerPair: number;
  resubmissionPolicy: TournamentResubmissionPolicy;
  rewardPolicy: TournamentRewardPolicy;
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
} as const;

const tournamentRulesSchema = z.object({
  schemaVersion: z.literal(TOURNAMENT_RULES_SCHEMA_VERSION),
  templateId: z.enum(["friend_challenge", "champion_challenge", "playground", "open_league", "sponsored_open", "duel_series", "benchmark_gauntlet", "championship", "custom"]),
  templateVersion: z.union([z.literal(1), z.literal(2), z.literal(TOURNAMENT_TEMPLATE_VERSION)]),
  duplicateStrategyPolicy: z.literal("reject_exact").optional(),
  engineVersion: z.enum(SUPPORTED_ARENA_ENGINE_VERSIONS),
  pairingMode: z.enum(["round_robin", "duel_series", "gauntlet"]),
  entryMode: z.enum(["open", "invite_only"]),
  minEntries: z.number().int(),
  maxEntries: z.number().int(),
  handsPerMatch: z.number().int(),
  encountersPerPair: z.number().int(),
  scheduleMode: z.literal("timed_rounds").optional(),
  qualificationHands: z.number().int().optional(),
  resubmissionPolicy: z.enum(["replace_until_lock", "fixed"]),
  rewardPolicy: z.enum(["optional", "funded_before_start"]),
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
    pairingMode: "round_robin",
    entryMode: "open",
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
    pairingMode: "round_robin",
    entryMode: "open",
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
    pairingMode: "round_robin",
    entryMode: "open",
    minEntries: 4,
    maxEntries: 16,
    handsPerMatch: 20,
    encountersPerPair: 1,
    scheduleMode: "timed_rounds",
    qualificationHands: 20_000,
    resubmissionPolicy: "replace_until_lock",
    rewardPolicy: "funded_before_start",
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
    summary: "A public exhibition with repeated scheduled rounds and a visible sample target.",
    bestFor: "Fast demos and first competitions",
    rules: templates.playground,
  },
  {
    id: "sponsored_open",
    group: "quick_start",
    name: "Sponsored open",
    summary: "A timed public league whose sponsor reward must be funded before play.",
    bestFor: "Open funded competitions",
    rules: templates.sponsored_open,
  },
  {
    id: "open_league",
    group: "advanced",
    name: "Open league",
    summary: "A public fixed-roster league with repeated rounds against every opponent.",
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
    || !validReplacement
  ) {
    throw new Error("TOURNAMENT_RULES_INVALID");
  }
  return rules;
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
}): TournamentRules {
  if (input.templateId !== "custom") {
    const rules = structuredClone(templates[input.templateId]);
    if (input.qualificationHands !== undefined) rules.qualificationHands = input.qualificationHands;
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
    minEntries,
    maxEntries,
    handsPerMatch: input.custom.handsPerMatch,
    encountersPerPair: input.custom.encountersPerPair,
    scheduleMode: "timed_rounds",
    qualificationHands: input.custom.qualificationHands ?? input.qualificationHands ?? 1_000,
    resubmissionPolicy: input.custom.resubmissionPolicy,
    rewardPolicy: input.custom.rewardPolicy,
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
  if (entries.length < rules.minEntries || entries.length > rules.maxEntries) {
    throw new Error("TOURNAMENT_ROSTER_SIZE_INVALID");
  }

  const basePairs: Array<[TournamentScheduleEntry, TournamentScheduleEntry]> = [];
  if (rules.pairingMode === "gauntlet") {
    const benchmark = entries.find((entry) => entry.agentId === input.benchmarkAgentId);
    if (!benchmark) throw new Error("TOURNAMENT_BENCHMARK_REQUIRED");
    for (const challenger of entries) {
      if (challenger.agentId !== benchmark.agentId) basePairs.push([benchmark, challenger]);
    }
  } else {
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
  const decisionsPerAgentPerRound = rules.pairingMode === "gauntlet"
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
    for (const [first, second] of basePairs) {
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
  if (!Number.isInteger(input.entryCount) || input.entryCount < rules.minEntries || input.entryCount > rules.maxEntries) {
    throw new Error("TOURNAMENT_ROSTER_SIZE_INVALID");
  }
  const basePairings = rules.pairingMode === "gauntlet"
    ? input.entryCount - 1
    : (input.entryCount * (input.entryCount - 1)) / 2;
  const decisionsPerAgentPerRound = rules.pairingMode === "gauntlet"
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
