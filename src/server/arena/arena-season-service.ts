import { randomUUID } from "node:crypto";

import { commitment } from "@/domain/canonical";
import { ARENA_ENGINE_VERSION } from "@/domain/arena/poker-engine";
import {
  buildTournamentSchedule,
  estimateTournamentWorkload,
  resolveTournamentRules,
  tournamentRulesCommitment,
  type CustomTournamentRulesInput,
  type TournamentRules,
  type TournamentTemplateId,
  type TournamentWorkload,
} from "@/domain/arena/tournament-rules";
import { authorizeProject } from "@/server/authorization/authorize";
import { encryptField } from "@/server/crypto/envelope";
import type { KeyProvider } from "@/server/crypto/key-provider";
import type { ArenaMatchService, ArenaMatchServiceErrorCode, PublicArenaMatchView } from "@/server/arena/arena-match-service";
import type {
  ArenaScheduledMatchRecord,
  ArenaSeasonEntryRecord,
  ArenaSeasonRecord,
  ArenaPrizePoolStatus,
  ProjectRepository,
} from "@/server/db/repositories";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";
import { openStrategyOwnerWallet } from "./strategy-artifacts";

export type ArenaSeasonServiceErrorCode =
  | "INVALID_INPUT"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_ACCESS_REQUIRED"
  | "ROLE_FORBIDDEN"
  | "ARENA_SEASON_NOT_FOUND"
  | "ARENA_SEASON_NOT_LOCKED"
  | "ARENA_SEASON_ALREADY_LOCKED"
  | "ARENA_SEASON_TOO_SMALL"
  | "ARENA_SEASON_FULL"
  | "ARENA_PRIZE_POOL_NOT_FUNDED"
  | "ARENA_BENCHMARK_REQUIRED"
  | "ARENA_WALLET_ALREADY_ENTERED"
  | "STRATEGY_ARTIFACT_NOT_FOUND"
  | "ARENA_SEASON_ENTRY_ALREADY_EXISTS"
  | "ARENA_SCHEDULED_MATCH_NOT_FOUND"
  | "ARENA_SCHEDULED_MATCH_IN_PROGRESS"
  | "IDEMPOTENCY_KEY_REUSED"
  | "PERSISTENCE_FAILED"
  | ArenaMatchServiceErrorCode;

export type ArenaSeasonServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ArenaSeasonServiceErrorCode };

export interface ArenaSeasonView {
  id: string;
  projectId: string;
  name: string;
  rulesetVersion: string;
  startsAt: string;
  locksAt: string;
  endsAt: string;
  status: ArenaSeasonRecord["status"];
  entryMode: "invite_only" | "open";
  maxEntries: number;
  templateId?: TournamentTemplateId;
  templateVersion?: number;
  rules?: TournamentRules;
  rulesCommitment?: string;
  workload?: TournamentWorkload;
  entryCount: number;
  prizeStatus?: ArenaPrizePoolStatus;
  createdAt: string;
  lockedAt?: string;
}

export interface ArenaSeasonEntryView {
  id: string;
  seasonId: string;
  agentId: string;
  displayName: string;
  artifactCommitment: string;
  joinedAt: string;
}

export interface ArenaScheduledMatchView {
  id: string;
  seasonId: string;
  sequence: number;
  hands: number;
  leftAgentId: string;
  rightAgentId: string;
  status: ArenaScheduledMatchRecord["status"];
  matchId?: string;
  createdAt: string;
}

export interface ArenaSeasonScheduleView {
  season: ArenaSeasonView;
  entries: ArenaSeasonEntryView[];
  matches: ArenaScheduledMatchView[];
}

export interface ArenaCompetitionSummaryView extends ArenaSeasonView {
  projectName: string;
  matchCount: number;
  completedMatchCount: number;
  runningMatchCount: number;
}

export interface ArenaSeasonServiceDependencies {
  repositories: ProjectRepository;
  keyProvider: KeyProvider;
  matchService: Pick<ArenaMatchService, "runMatch" | "getPublicArena">;
  walletHashPepper: string;
  now?: () => Date;
  idFactory?: () => string;
}

const idempotencyKeyPattern = /^[\x21-\x7e]{8,200}$/;
const rulesetPattern = /^[a-z0-9][a-z0-9._-]{0,39}$/;

function mapAuthorizationCode(code: string): ArenaSeasonServiceErrorCode {
  return code === "PROJECT_ACCESS_REQUIRED" ? "PROJECT_ACCESS_REQUIRED" : "ROLE_FORBIDDEN";
}

function mapPersistenceError(error: unknown): ArenaSeasonServiceErrorCode {
  if (!(error instanceof Error)) return "PERSISTENCE_FAILED";
  if (error.message === "ARENA_SEASON_ENTRY_AGENT_ALREADY_EXISTS") return "ARENA_SEASON_ENTRY_ALREADY_EXISTS";
  if (error.message === "ARENA_SEASON_NOT_OPEN") return "ARENA_SEASON_ALREADY_LOCKED";
  if (error.message.includes("IDEMPOTENCY")) return "IDEMPOTENCY_KEY_REUSED";
  return "PERSISTENCE_FAILED";
}

function parseDate(value: string): Date | undefined {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function validKey(value: string): boolean {
  return idempotencyKeyPattern.test(value);
}

function normalizeSchedule(
  season: ArenaSeasonRecord,
  entries: ArenaSeasonEntryRecord[],
  matches: ArenaScheduledMatchRecord[],
  prizeStatus?: ArenaPrizePoolStatus,
): ArenaSeasonScheduleView {
  const workload = season.rulesSnapshot && entries.length >= season.rulesSnapshot.minEntries
    ? estimateTournamentWorkload({ rules: season.rulesSnapshot, entryCount: entries.length })
    : undefined;
  return {
    season: {
      id: season.id,
      projectId: season.projectId,
      name: season.name,
      rulesetVersion: season.rulesetVersion,
      startsAt: season.startsAt.toISOString(),
      locksAt: season.locksAt.toISOString(),
      endsAt: season.endsAt.toISOString(),
      status: season.status,
      entryMode: season.entryMode ?? "invite_only",
      maxEntries: season.maxEntries ?? 16,
      templateId: season.templateId,
      templateVersion: season.templateVersion,
      rules: season.rulesSnapshot,
      rulesCommitment: season.rulesCommitment,
      workload,
      entryCount: entries.length,
      prizeStatus,
      createdAt: season.createdAt.toISOString(),
      lockedAt: season.lockedAt?.toISOString(),
    },
    entries: entries.map((entry) => ({
      id: entry.id,
      seasonId: entry.seasonId,
      agentId: entry.agentId,
      displayName: entry.displayName,
      artifactCommitment: entry.artifactCommitment,
      joinedAt: entry.joinedAt.toISOString(),
    })),
    matches: matches.map((match) => ({
      id: match.id,
      seasonId: match.seasonId,
      sequence: match.sequence,
      hands: match.hands,
      leftAgentId: match.leftAgentId,
      rightAgentId: match.rightAgentId,
      status: match.status,
      matchId: match.matchId,
      createdAt: match.createdAt.toISOString(),
    })),
  };
}

export class ArenaSeasonService {
  private readonly repositories: ProjectRepository;
  private readonly keyProvider: KeyProvider;
  private readonly matchService: ArenaSeasonServiceDependencies["matchService"];
  private readonly walletHashPepper: string;
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(dependencies: ArenaSeasonServiceDependencies) {
    this.repositories = dependencies.repositories;
    this.keyProvider = dependencies.keyProvider;
    this.matchService = dependencies.matchService;
    this.walletHashPepper = dependencies.walletHashPepper;
    this.now = dependencies.now ?? (() => new Date());
    this.idFactory = dependencies.idFactory ?? randomUUID;
  }

  async createSeason(input: {
    projectId: string;
    actorWalletAddress: string;
    idempotencyKey: string;
    name: string;
    rulesetVersion?: string;
    startsAt: string;
    locksAt: string;
    endsAt: string;
    entryMode?: "invite_only" | "open";
    maxEntries?: number;
    templateId?: TournamentTemplateId;
    customRules?: CustomTournamentRulesInput;
  }): Promise<ArenaSeasonServiceResult<ArenaSeasonView>> {
    const projectId = input.projectId.trim();
    const name = input.name.trim();
    const rulesetVersion = input.rulesetVersion?.trim() || ARENA_ENGINE_VERSION;
    const startsAt = parseDate(input.startsAt);
    const locksAt = parseDate(input.locksAt);
    const endsAt = parseDate(input.endsAt);
    let rules: TournamentRules;
    try {
      rules = resolveTournamentRules({
        templateId: input.templateId ?? "custom",
        custom: input.templateId
          ? input.customRules
          : {
            pairingMode: "round_robin",
            entryMode: input.entryMode ?? "invite_only",
            maxEntries: input.maxEntries ?? 16,
            handsPerMatch: 8,
            encountersPerPair: 1,
            resubmissionPolicy: "fixed",
            rewardPolicy: "optional",
          },
      });
    } catch {
      return { ok: false, code: "INVALID_INPUT" };
    }
    const entryMode = rules.entryMode;
    const maxEntries = rules.maxEntries;
    const rulesCommitment = tournamentRulesCommitment(rules);
    if (!projectId || !name || name.length > 120 || !rulesetPattern.test(rulesetVersion) || !startsAt || !locksAt || !endsAt || !(startsAt < locksAt && locksAt < endsAt) || !validKey(input.idempotencyKey)) {
      return { ok: false, code: "INVALID_INPUT" };
    }

    try {
      const project = await this.repositories.getProject(projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const actorFingerprint = fingerprintWallet(input.actorWalletAddress, this.walletHashPepper);
      const authorized = await authorizeProject(this.repositories, {
        projectId,
        walletFingerprint: actorFingerprint,
        action: "create_arena_season",
      });
      if (!authorized.ok) return { ok: false, code: mapAuthorizationCode(authorized.code) };

      const requestDigest = commitment({
        actorFingerprint,
        name,
        rulesetVersion,
        startsAt: startsAt.toISOString(),
        locksAt: locksAt.toISOString(),
        endsAt: endsAt.toISOString(),
        entryMode,
        maxEntries,
        rules,
        rulesCommitment,
      });
      const existing = await this.repositories.getArenaSeasonByCreateIdempotencyKey(projectId, input.idempotencyKey);
      if (existing) return existing.createRequestDigest === requestDigest ? { ok: true, value: this.view(existing) } : { ok: false, code: "IDEMPOTENCY_KEY_REUSED" };

      const createdAt = this.now();
      const record: ArenaSeasonRecord = {
        id: this.idFactory(),
        projectId,
        name,
        rulesetVersion,
        startsAt,
        locksAt,
        endsAt,
        status: "open",
        entryMode,
        maxEntries,
        templateId: rules.templateId,
        templateVersion: rules.templateVersion,
        rulesSnapshot: rules,
        rulesCommitment,
        createdBy: actorFingerprint,
        createdAt,
        createIdempotencyKey: input.idempotencyKey,
        createRequestDigest: requestDigest,
      };
      await this.repositories.saveArenaSeason(record);
      await this.repositories.saveAuditEvent({
        id: this.idFactory(),
        projectId,
        actorFingerprint,
        eventType: "arena_season_created",
        payloadDigest: commitment({
          seasonId: record.id,
          name,
          rulesetVersion,
          startsAt: startsAt.toISOString(),
          locksAt: locksAt.toISOString(),
          endsAt: endsAt.toISOString(),
          entryMode,
          maxEntries,
          templateId: rules.templateId,
          templateVersion: rules.templateVersion,
          rulesCommitment,
        }),
        createdAt,
      });
      return { ok: true, value: this.view(record) };
    } catch (error) {
      return { ok: false, code: mapPersistenceError(error) };
    }
  }

  async registerEntry(input: {
    projectId: string;
    actorWalletAddress: string;
    seasonId: string;
    agentId: string;
    idempotencyKey: string;
  }): Promise<ArenaSeasonServiceResult<ArenaSeasonEntryView>> {
    const projectId = input.projectId.trim();
    const seasonId = input.seasonId.trim();
    const agentId = input.agentId.trim();
    if (!projectId || !seasonId || !agentId || agentId.length > 80 || !validKey(input.idempotencyKey)) return { ok: false, code: "INVALID_INPUT" };

    try {
      const project = await this.repositories.getProject(projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const season = await this.repositories.getArenaSeason(projectId, seasonId);
      if (!season) return { ok: false, code: "ARENA_SEASON_NOT_FOUND" };
      const actorFingerprint = fingerprintWallet(input.actorWalletAddress, this.walletHashPepper);
      const authorized = await authorizeProject(this.repositories, {
        projectId,
        walletFingerprint: actorFingerprint,
        action: "register_arena_entry",
      });
      if (!authorized.ok) return { ok: false, code: mapAuthorizationCode(authorized.code) };
      if (season.status !== "open") return { ok: false, code: "ARENA_SEASON_ALREADY_LOCKED" };

      const artifact = await this.repositories.getArenaStrategyArtifact(projectId, agentId);
      if (!artifact) return { ok: false, code: "STRATEGY_ARTIFACT_NOT_FOUND" };
      const entries = await this.repositories.listArenaSeasonEntries(projectId, seasonId);
      if (entries.length >= (season.maxEntries ?? 16)) return { ok: false, code: "ARENA_SEASON_FULL" };
      const ownerBoundEntry = (season.entryMode ?? "invite_only") === "open";
      if (ownerBoundEntry && artifact.ownerFingerprint) {
        const ownerEntry = await this.repositories.getArenaSeasonEntryByOwnerFingerprint(projectId, seasonId, artifact.ownerFingerprint);
        if (ownerEntry) return ownerEntry.agentId === artifact.agentId
          ? { ok: true, value: this.entryView(ownerEntry) }
          : { ok: false, code: "ARENA_WALLET_ALREADY_ENTERED" };
      }
      const requestDigest = commitment({ actorFingerprint, seasonId, agentId, artifactCommitment: artifact.artifactCommitment });
      const existingByKey = await this.repositories.getArenaSeasonEntryByIdempotencyKey(projectId, seasonId, input.idempotencyKey);
      if (existingByKey) return existingByKey.requestDigest === requestDigest ? { ok: true, value: this.entryView(existingByKey) } : { ok: false, code: "IDEMPOTENCY_KEY_REUSED" };
      const existingAgent = await this.repositories.getArenaSeasonEntry(projectId, seasonId, agentId);
      if (existingAgent) return existingAgent.artifactCommitment === artifact.artifactCommitment
        ? { ok: true, value: this.entryView(existingAgent) }
        : { ok: false, code: "ARENA_SEASON_ENTRY_ALREADY_EXISTS" };

      const entryId = this.idFactory();
      const dataKey = ownerBoundEntry && artifact.encryptedOwnerWallet
        ? await this.keyProvider.unwrap(project.wrappedDataKey, projectId)
        : undefined;
      const ownerWallet = dataKey
        ? openStrategyOwnerWallet({ record: artifact, keyMaterial: { dataKey, wrappedKey: project.wrappedDataKey } })
        : undefined;
      const record: ArenaSeasonEntryRecord = {
        id: entryId,
        seasonId,
        projectId,
        agentId,
        displayName: artifact.displayName,
        artifactCommitment: artifact.artifactCommitment,
        ownerFingerprint: ownerBoundEntry ? artifact.ownerFingerprint : undefined,
        encryptedPayoutWallet: ownerWallet && dataKey
          ? encryptField(
            ownerWallet,
            { projectId, recordType: "arena_season_entry", recordId: entryId, fieldName: "payout_wallet" },
            { dataKey, wrappedKey: project.wrappedDataKey },
          )
          : undefined,
        version: 1,
        joinedAt: this.now(),
        idempotencyKey: input.idempotencyKey,
        requestDigest,
      };
      await this.repositories.saveArenaSeasonEntry(record);
      await this.repositories.saveAuditEvent({
        id: this.idFactory(),
        projectId,
        actorFingerprint,
        eventType: "arena_season_entry_registered",
        payloadDigest: commitment({ seasonId, agentId, artifactCommitment: artifact.artifactCommitment }),
        createdAt: this.now(),
      });
      return { ok: true, value: this.entryView(record) };
    } catch (error) {
      return { ok: false, code: mapPersistenceError(error) };
    }
  }

  async lockSeason(input: {
    projectId: string;
    actorWalletAddress: string;
    seasonId: string;
    hands?: number;
    benchmarkAgentId?: string;
    idempotencyKey: string;
  }): Promise<ArenaSeasonServiceResult<ArenaSeasonScheduleView>> {
    const projectId = input.projectId.trim();
    const seasonId = input.seasonId.trim();
    if (!projectId || !seasonId || !validKey(input.idempotencyKey)) return { ok: false, code: "INVALID_INPUT" };

    try {
      const project = await this.repositories.getProject(projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const season = await this.repositories.getArenaSeason(projectId, seasonId);
      if (!season) return { ok: false, code: "ARENA_SEASON_NOT_FOUND" };
      const actorFingerprint = fingerprintWallet(input.actorWalletAddress, this.walletHashPepper);
      const authorized = await authorizeProject(this.repositories, {
        projectId,
        walletFingerprint: actorFingerprint,
        action: "lock_arena_season",
      });
      if (!authorized.ok) return { ok: false, code: mapAuthorizationCode(authorized.code) };

      const entries = await this.repositories.listArenaSeasonEntries(projectId, seasonId);
      let rules: TournamentRules;
      try {
        rules = season.rulesSnapshot ?? resolveTournamentRules({
          templateId: "custom",
          custom: {
            pairingMode: "round_robin",
            entryMode: season.entryMode ?? "invite_only",
            maxEntries: season.maxEntries ?? 16,
            handsPerMatch: input.hands ?? 8,
            encountersPerPair: 1,
            resubmissionPolicy: "fixed",
            rewardPolicy: "optional",
          },
        });
      } catch {
        return { ok: false, code: "INVALID_INPUT" };
      }
      if (rules.rewardPolicy === "funded_before_start") {
        const prize = await this.repositories.getArenaPrizePool(projectId, seasonId);
        if (prize?.status !== "funded") return { ok: false, code: "ARENA_PRIZE_POOL_NOT_FUNDED" };
      }
      const rulesCommitment = season.rulesCommitment ?? tournamentRulesCommitment(rules);
      const benchmarkAgentId = input.benchmarkAgentId?.trim() || undefined;
      const requestDigest = commitment({ actorFingerprint, seasonId, rulesCommitment, benchmarkAgentId: benchmarkAgentId ?? null, entries: entries.map((entry) => [entry.agentId, entry.artifactCommitment]) });
      if (season.lockIdempotencyKey) {
        if (season.lockIdempotencyKey !== input.idempotencyKey || season.lockRequestDigest !== requestDigest) return { ok: false, code: "IDEMPOTENCY_KEY_REUSED" };
        return { ok: true, value: normalizeSchedule(season, entries, await this.repositories.listArenaScheduledMatches(projectId, seasonId)) };
      }
      if (season.status !== "open") return { ok: false, code: "ARENA_SEASON_ALREADY_LOCKED" };
      if (entries.length < rules.minEntries) return { ok: false, code: "ARENA_SEASON_TOO_SMALL" };

      const orderedEntries = [...entries].sort((left, right) => left.joinedAt.getTime() - right.joinedAt.getTime() || left.agentId.localeCompare(right.agentId));
      const createdAt = this.now();
      let generatedSchedule: ReturnType<typeof buildTournamentSchedule>;
      try {
        generatedSchedule = buildTournamentSchedule({ rules, entries: orderedEntries, benchmarkAgentId });
      } catch (error) {
        if (error instanceof Error && error.message === "TOURNAMENT_BENCHMARK_REQUIRED") {
          return { ok: false, code: "ARENA_BENCHMARK_REQUIRED" };
        }
        return { ok: false, code: "INVALID_INPUT" };
      }
      const matches: ArenaScheduledMatchRecord[] = generatedSchedule.map((pairing) => ({
            id: this.idFactory(),
            seasonId,
            projectId,
            sequence: pairing.sequence,
            hands: pairing.hands,
            leftAgentId: pairing.leftAgentId,
            rightAgentId: pairing.rightAgentId,
            status: "scheduled",
            matchId: this.idFactory(),
            attempts: 0,
            createdAt,
      }));
      const lockedSeason: ArenaSeasonRecord = {
        ...season,
        status: "locked",
        lockedAt: createdAt,
        lockIdempotencyKey: input.idempotencyKey,
        lockRequestDigest: requestDigest,
      };
      await this.repositories.saveArenaSeasonSchedule({
        season: lockedSeason,
        matches,
        audit: {
          id: this.idFactory(),
          projectId,
          actorFingerprint,
          eventType: "arena_season_locked",
          payloadDigest: commitment({ seasonId, entryCount: entries.length, matchCount: matches.length, rulesCommitment, benchmarkAgentId: benchmarkAgentId ?? null }),
          createdAt,
        },
      });
      return { ok: true, value: normalizeSchedule(lockedSeason, entries, matches) };
    } catch (error) {
      if (error instanceof Error && error.message === "ARENA_SEASON_NOT_OPEN") {
        const current = await this.repositories.getArenaSeason(projectId, seasonId);
        if (current?.status === "locked" && current.lockIdempotencyKey === input.idempotencyKey) {
          return { ok: true, value: normalizeSchedule(current, await this.repositories.listArenaSeasonEntries(projectId, seasonId), await this.repositories.listArenaScheduledMatches(projectId, seasonId)) };
        }
        return { ok: false, code: "ARENA_SEASON_ALREADY_LOCKED" };
      }
      return { ok: false, code: mapPersistenceError(error) };
    }
  }

  async getPublicSchedule(projectId: string, seasonId: string): Promise<ArenaSeasonServiceResult<ArenaSeasonScheduleView>> {
    try {
      const season = await this.repositories.getArenaSeason(projectId.trim(), seasonId.trim());
      if (!season) return { ok: false, code: "ARENA_SEASON_NOT_FOUND" };
      return {
        ok: true,
        value: normalizeSchedule(
          season,
          await this.repositories.listArenaSeasonEntries(projectId, seasonId),
          await this.repositories.listArenaScheduledMatches(projectId, seasonId),
          (await this.repositories.getArenaPrizePool(projectId, seasonId))?.status,
        ),
      };
    } catch {
      return { ok: false, code: "PERSISTENCE_FAILED" };
    }
  }

  async runScheduledMatch(input: {
    projectId: string;
    actorWalletAddress: string;
    seasonId: string;
    scheduledMatchId: string;
    idempotencyKey: string;
  }): Promise<ArenaSeasonServiceResult<PublicArenaMatchView>> {
    const projectId = input.projectId.trim();
    const seasonId = input.seasonId.trim();
    const scheduledMatchId = input.scheduledMatchId.trim();
    if (!projectId || !seasonId || !scheduledMatchId || !validKey(input.idempotencyKey)) return { ok: false, code: "INVALID_INPUT" };

    try {
      const project = await this.repositories.getProject(projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const season = await this.repositories.getArenaSeason(projectId, seasonId);
      if (!season) return { ok: false, code: "ARENA_SEASON_NOT_FOUND" };
      const actorFingerprint = fingerprintWallet(input.actorWalletAddress, this.walletHashPepper);
      const authorized = await authorizeProject(this.repositories, {
        projectId,
        walletFingerprint: actorFingerprint,
        action: "run_arena_match",
      });
      if (!authorized.ok) return { ok: false, code: mapAuthorizationCode(authorized.code) };
      if (season.status !== "locked") return { ok: false, code: "ARENA_SEASON_NOT_LOCKED" };

      const scheduled = await this.repositories.getArenaScheduledMatch(projectId, seasonId, scheduledMatchId);
      if (!scheduled) return { ok: false, code: "ARENA_SCHEDULED_MATCH_NOT_FOUND" };
      const existingMatch = async (): Promise<ArenaSeasonServiceResult<PublicArenaMatchView>> => {
        if (!scheduled.matchId) return { ok: false, code: "PERSISTENCE_FAILED" };
        const arena = await this.matchService.getPublicArena(projectId);
        if (!arena.ok) return { ok: false, code: arena.code };
        const match = arena.value.matches.find((candidate) => candidate.matchId === scheduled.matchId);
        return match ? { ok: true, value: match } : { ok: false, code: "PERSISTENCE_FAILED" };
      };
      if (scheduled.status === "completed") return existingMatch();

      const executionRequestDigest = commitment({
        actorFingerprint,
        seasonId,
        scheduledMatchId,
        hands: scheduled.hands,
        leftAgentId: scheduled.leftAgentId,
        rightAgentId: scheduled.rightAgentId,
      });
      const claimed = await this.repositories.claimArenaScheduledMatch({
        projectId,
        seasonId,
        scheduledMatchId,
        now: this.now(),
        leaseMs: 120_000,
        executionIdempotencyKey: input.idempotencyKey,
        executionRequestDigest,
      });
      if (!claimed) return { ok: false, code: "ARENA_SCHEDULED_MATCH_NOT_FOUND" };
      if (claimed === "IN_PROGRESS") return { ok: false, code: "ARENA_SCHEDULED_MATCH_IN_PROGRESS" };
      if (claimed.status === "completed") return existingMatch();
      const executionKey = `scheduled-${scheduled.id}`;
      const result = await this.matchService.runMatch({
        projectId,
        actorWalletAddress: input.actorWalletAddress,
        leftAgentId: claimed.leftAgentId,
        rightAgentId: claimed.rightAgentId,
        hands: claimed.hands,
        engineVersion: season.rulesSnapshot?.engineVersion,
        matchId: claimed.matchId,
        idempotencyKey: executionKey,
      });
      if (!result.ok) {
        await this.repositories.updateArenaScheduledMatch({
          ...claimed,
          status: "failed",
          leaseExpiresAt: undefined,
          lastError: result.code,
        });
        return { ok: false, code: result.code };
      }
      await this.repositories.updateArenaScheduledMatch({
        ...claimed,
        status: "completed",
        matchId: result.value.matchId,
        leaseExpiresAt: undefined,
        completedAt: this.now(),
        lastError: undefined,
      });
      return { ok: true, value: result.value };
    } catch (error) {
      if (error instanceof Error && error.message === "ARENA_SCHEDULED_MATCH_NOT_FOUND") return { ok: false, code: "ARENA_SCHEDULED_MATCH_NOT_FOUND" };
      return { ok: false, code: mapPersistenceError(error) };
    }
  }

  async listPublicSeasons(projectId: string): Promise<ArenaSeasonServiceResult<ArenaSeasonView[]>> {
    try {
      const project = await this.repositories.getProject(projectId.trim());
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const records = await this.repositories.listArenaSeasons(projectId);
      const values = await Promise.all(records.map(async (record) => normalizeSchedule(
        record,
        await this.repositories.listArenaSeasonEntries(projectId, record.id),
        [],
        (await this.repositories.getArenaPrizePool(projectId, record.id))?.status,
      ).season));
      return { ok: true, value: values };
    } catch {
      return { ok: false, code: "PERSISTENCE_FAILED" };
    }
  }

  async listAllPublicSeasons(): Promise<ArenaSeasonServiceResult<ArenaCompetitionSummaryView[]>> {
    try {
      const records = (await this.repositories.listAllArenaSeasons())
        .filter((record) => (record.entryMode ?? "invite_only") === "open");
      const values = await Promise.all(records.map(async (record) => {
        const [project, entries, matches, prizePool] = await Promise.all([
          this.repositories.getProject(record.projectId),
          this.repositories.listArenaSeasonEntries(record.projectId, record.id),
          this.repositories.listArenaScheduledMatches(record.projectId, record.id),
          this.repositories.getArenaPrizePool(record.projectId, record.id),
        ]);
        const season = normalizeSchedule(record, entries, matches, prizePool?.status).season;
        return {
          ...season,
          projectName: project?.name ?? "Veil Arena",
          matchCount: matches.length,
          completedMatchCount: matches.filter((match) => match.status === "completed").length,
          runningMatchCount: matches.filter((match) => match.status === "running").length,
        } satisfies ArenaCompetitionSummaryView;
      }));
      return { ok: true, value: values };
    } catch {
      return { ok: false, code: "PERSISTENCE_FAILED" };
    }
  }

  private view(record: ArenaSeasonRecord): ArenaSeasonView {
    return normalizeSchedule(record, [], []).season;
  }

  private entryView(record: ArenaSeasonEntryRecord): ArenaSeasonEntryView {
    return {
      id: record.id,
      seasonId: record.seasonId,
      agentId: record.agentId,
      displayName: record.displayName,
      artifactCommitment: record.artifactCommitment,
      joinedAt: record.joinedAt.toISOString(),
    };
  }

}
