import type { ArenaSeasonService } from "./arena-season-service";
import type { ProjectRepository } from "@/server/db/repositories";
import { eligibleMatch } from "@/domain/arena/queue-policy";

export type ArenaWorkerTickResult = {
  status: "idle" | "completed" | "in_progress" | "failed";
  projectId: string;
  seasonId: string;
  scheduledMatchId?: string;
  matchId?: string;
  errorCode?: string;
};

export type ArenaWorkerBatchResult = {
  status: ArenaWorkerTickResult["status"];
  results: ArenaWorkerTickResult[];
};

export interface ArenaWorkerServiceDependencies {
  repositories: Pick<ProjectRepository, "listAllArenaSeasons" | "listArenaScheduledMatches">;
  seasonService: Pick<ArenaSeasonService, "runScheduledMatch"> & Partial<Pick<ArenaSeasonService, "lockSeason">>;
  workerWalletAddress: string;
  now?: () => Date;
  maxConcurrentMatches?: number;
}

export class ArenaWorkerService {
  private readonly repositories: ArenaWorkerServiceDependencies["repositories"];
  private readonly seasonService: ArenaWorkerServiceDependencies["seasonService"];
  private readonly workerWalletAddress: string;
  private readonly now: () => Date;
  private readonly maxConcurrentMatches: number;

  constructor(dependencies: ArenaWorkerServiceDependencies) {
    this.repositories = dependencies.repositories;
    this.seasonService = dependencies.seasonService;
    this.workerWalletAddress = dependencies.workerWalletAddress.trim();
    this.now = dependencies.now ?? (() => new Date());
    this.maxConcurrentMatches = Math.min(8, Math.max(1, Math.floor(dependencies.maxConcurrentMatches ?? 4)));
  }

  async runDueBatch(input: { projectId?: string; seasonId?: string } = {}): Promise<ArenaWorkerBatchResult> {
    const projectId = input.projectId?.trim() ?? "";
    const seasonId = input.seasonId?.trim() ?? "";
    if (!this.workerWalletAddress || Boolean(projectId) !== Boolean(seasonId)) {
      return { status: "failed", results: [{ status: "failed", projectId, seasonId, errorCode: "INVALID_INPUT" }] };
    }

    if (projectId && seasonId) {
      const lockFailure = await this.lockDueSeason(projectId, seasonId);
      if (lockFailure) return { status: "failed", results: [lockFailure] };
      const matches = await this.repositories.listArenaScheduledMatches(projectId, seasonId);
      const due = matches
        .filter((match) => eligibleMatch(match, this.now()))
        .sort((left, right) => (left.scheduledFor?.getTime() ?? left.createdAt.getTime()) - (right.scheduledFor?.getTime() ?? right.createdAt.getTime()) || left.sequence - right.sequence)
        .slice(0, this.maxConcurrentMatches);
      if (!due.length) return { status: "idle", results: [] };
      const results = await Promise.all(due.map((match) => this.runScheduled(projectId, seasonId, match.id)));
      return { status: batchStatus(results), results };
    }

    const allSeasons = await this.repositories.listAllArenaSeasons();
    const autoLockedSeasonIds = new Set<string>();
    const failures: ArenaWorkerTickResult[] = [];
    for (const season of allSeasons.filter((candidate) => candidate.status === "open" && (candidate.locksAt?.getTime() ?? Number.POSITIVE_INFINITY) <= this.now().getTime())) {
      const lockFailure = await this.lockDueSeason(season.projectId, season.id);
      if (lockFailure) failures.push(lockFailure);
      else if (this.seasonService.lockSeason) autoLockedSeasonIds.add(`${season.projectId}:${season.id}`);
    }
    const seasons = allSeasons
      .filter((season) => season.status === "locked" || autoLockedSeasonIds.has(`${season.projectId}:${season.id}`))
      .sort((left, right) => (left.lockedAt?.getTime() ?? left.createdAt.getTime()) - (right.lockedAt?.getTime() ?? right.createdAt.getTime()) || left.id.localeCompare(right.id));
    const queues = await Promise.all(seasons.map(async (season) => ({
      season,
      matches: (await this.repositories.listArenaScheduledMatches(season.projectId, season.id))
        .filter((match) => eligibleMatch(match, this.now()))
        .sort((left, right) => left.sequence - right.sequence),
    })));
    const due: Array<{ projectId: string; seasonId: string; matchId: string }> = [];
    let cursor = 0;
    while (due.length < this.maxConcurrentMatches && queues.some((queue) => cursor < queue.matches.length)) {
      for (const queue of queues) {
        const match = queue.matches[cursor];
        if (match && due.length < this.maxConcurrentMatches) due.push({ projectId: queue.season.projectId, seasonId: queue.season.id, matchId: match.id });
      }
      cursor += 1;
    }
    if (!due.length) return failures.length ? { status: "failed", results: failures } : { status: "idle", results: [] };
    const results = await Promise.all(due.map((match) => this.runScheduled(match.projectId, match.seasonId, match.matchId)));
    return { status: batchStatus(results), results: [...failures, ...results] };
  }

  async runNext(input: { projectId?: string; seasonId?: string } = {}): Promise<ArenaWorkerTickResult> {
    const projectId = input.projectId?.trim() ?? "";
    const seasonId = input.seasonId?.trim() ?? "";
    if (!this.workerWalletAddress || Boolean(projectId) !== Boolean(seasonId)) {
      return { status: "failed", projectId, seasonId, errorCode: "INVALID_INPUT" };
    }

    if (projectId && seasonId) {
      const lockFailure = await this.lockDueSeason(projectId, seasonId);
      if (lockFailure) return lockFailure;
      return this.runNextForSeason(projectId, seasonId);
    }

    const allSeasons = await this.repositories.listAllArenaSeasons();
    const autoLockedSeasonIds = new Set<string>();
    let lastFailure: ArenaWorkerTickResult | undefined;
    for (const season of allSeasons.filter((candidate) => candidate.status === "open" && (candidate.locksAt?.getTime() ?? Number.POSITIVE_INFINITY) <= this.now().getTime())) {
      const lockFailure = await this.lockDueSeason(season.projectId, season.id);
      if (lockFailure) lastFailure = lockFailure;
      else if (this.seasonService.lockSeason) autoLockedSeasonIds.add(`${season.projectId}:${season.id}`);
    }

    const seasons = allSeasons
      .filter((season) => season.status === "locked" || autoLockedSeasonIds.has(`${season.projectId}:${season.id}`))
      .sort((left, right) => (
        (left.lockedAt?.getTime() ?? left.createdAt.getTime()) - (right.lockedAt?.getTime() ?? right.createdAt.getTime())
        || left.id.localeCompare(right.id)
      ));
    const lastServed = new Map<string, number>();
    for (const season of seasons) {
      const matches = await this.repositories.listArenaScheduledMatches(season.projectId, season.id);
      lastServed.set(season.id, Math.max(0, ...matches.map((match) => match.startedAt?.getTime() ?? 0)));
    }
    seasons.sort((a, b) => (lastServed.get(a.id) ?? 0) - (lastServed.get(b.id) ?? 0));
    for (const season of seasons) {
      const result = await this.runNextForSeason(season.projectId, season.id);
      if (result.status === "completed" || result.status === "in_progress") return result;
      if (result.status === "failed") lastFailure = result;
    }
    return lastFailure ?? { status: "idle", projectId: "", seasonId: "" };
  }

  private async lockDueSeason(projectId: string, seasonId: string): Promise<ArenaWorkerTickResult | undefined> {
    const season = (await this.repositories.listAllArenaSeasons()).find((candidate) => candidate.projectId === projectId && candidate.id === seasonId);
    if (!season || season.status !== "open" || (season.locksAt?.getTime() ?? Number.POSITIVE_INFINITY) > this.now().getTime()) return undefined;
    if (!this.seasonService.lockSeason) {
      return { status: "failed", projectId, seasonId, errorCode: "ARENA_AUTO_LOCK_UNAVAILABLE" };
    }
    const result = await this.seasonService.lockSeason({
      projectId,
      seasonId,
      actorWalletAddress: this.workerWalletAddress,
      idempotencyKey: `auto-lock-${seasonId}`,
      automatic: true,
    });
    return result.ok ? undefined : { status: "failed", projectId, seasonId, errorCode: result.code };
  }

  private async runNextForSeason(projectId: string, seasonId: string): Promise<ArenaWorkerTickResult> {
    const scheduledMatches = await this.repositories.listArenaScheduledMatches(projectId, seasonId);
    const now = this.now();
    const next = scheduledMatches.filter((match) => eligibleMatch(match, now)).sort((a, b) => (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0) || a.sequence - b.sequence)[0];
    if (!next) return { status: "idle", projectId, seasonId };

    return this.runScheduled(projectId, seasonId, next.id);
  }

  private async runScheduled(projectId: string, seasonId: string, scheduledMatchId: string): Promise<ArenaWorkerTickResult> {
    const result = await this.seasonService.runScheduledMatch({
      projectId,
      seasonId,
      scheduledMatchId,
      actorWalletAddress: this.workerWalletAddress,
      idempotencyKey: `worker-${scheduledMatchId}`,
    });
    if (result.ok) {
      return {
        status: "completed",
        projectId,
        seasonId,
        scheduledMatchId,
        matchId: result.value.matchId,
      };
    }
    if (result.code === "ARENA_SCHEDULED_MATCH_IN_PROGRESS") {
      return { status: "in_progress", projectId, seasonId, scheduledMatchId };
    }
    return { status: "failed", projectId, seasonId, scheduledMatchId, errorCode: result.code };
  }
}

function batchStatus(results: ArenaWorkerTickResult[]): ArenaWorkerBatchResult["status"] {
  if (results.some((result) => result.status === "completed")) return "completed";
  if (results.some((result) => result.status === "in_progress")) return "in_progress";
  if (results.some((result) => result.status === "failed")) return "failed";
  return "idle";
}
