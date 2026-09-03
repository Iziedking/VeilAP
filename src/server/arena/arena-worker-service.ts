import type { ArenaSeasonService } from "./arena-season-service";
import type { ProjectRepository } from "@/server/db/repositories";
import { arenaMatchStartsAt } from "@/domain/arena/match-schedule";

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
  seasonService: Pick<ArenaSeasonService, "runScheduledMatch">;
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

    if (projectId && seasonId) return this.runNextForSeason(projectId, seasonId);

    const seasons = (await this.repositories.listAllArenaSeasons())
      .filter((season) => season.status === "locked")
      .sort((left, right) => (
        (left.lockedAt?.getTime() ?? left.createdAt.getTime()) - (right.lockedAt?.getTime() ?? right.createdAt.getTime())
        || left.id.localeCompare(right.id)
      ));
    for (const season of seasons) {
      const result = await this.runNextForSeason(season.projectId, season.id);
      if (result.status !== "idle") return result;
    }
    return { status: "idle", projectId: "", seasonId: "" };
  }

  private async runNextForSeason(projectId: string, seasonId: string): Promise<ArenaWorkerTickResult> {
    const scheduledMatches = await this.repositories.listArenaScheduledMatches(projectId, seasonId);
    const now = this.now();
    const next = scheduledMatches.find((match) => (
      match.status === "failed"
      || (match.status === "scheduled" && arenaMatchStartsAt(match) <= now)
    ));
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
