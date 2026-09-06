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

export interface ArenaWorkerServiceDependencies {
  repositories: Pick<ProjectRepository, "listAllArenaSeasons" | "listArenaScheduledMatches">;
  seasonService: Pick<ArenaSeasonService, "runScheduledMatch"> & Partial<Pick<ArenaSeasonService, "lockSeason">>;
  workerWalletAddress: string;
  now?: () => Date;
}

export class ArenaWorkerService {
  private readonly repositories: ArenaWorkerServiceDependencies["repositories"];
  private readonly seasonService: ArenaWorkerServiceDependencies["seasonService"];
  private readonly workerWalletAddress: string;
  private readonly now: () => Date;

  constructor(dependencies: ArenaWorkerServiceDependencies) {
    this.repositories = dependencies.repositories;
    this.seasonService = dependencies.seasonService;
    this.workerWalletAddress = dependencies.workerWalletAddress.trim();
    this.now = dependencies.now ?? (() => new Date());
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

    const result = await this.seasonService.runScheduledMatch({
      projectId,
      seasonId,
      scheduledMatchId: next.id,
      actorWalletAddress: this.workerWalletAddress,
      idempotencyKey: `worker-${next.id}`,
    });
    if (result.ok) {
      return {
        status: "completed",
        projectId,
        seasonId,
        scheduledMatchId: next.id,
        matchId: result.value.matchId,
      };
    }
    if (result.code === "ARENA_SCHEDULED_MATCH_IN_PROGRESS") {
      return { status: "in_progress", projectId, seasonId, scheduledMatchId: next.id };
    }
    return { status: "failed", projectId, seasonId, scheduledMatchId: next.id, errorCode: result.code };
  }
}
