import type { ArenaSeasonService } from "./arena-season-service";
import type { ProjectRepository } from "@/server/db/repositories";

export type ArenaWorkerTickResult = {
  status: "idle" | "completed" | "in_progress" | "failed";
  projectId: string;
  seasonId: string;
  scheduledMatchId?: string;
  matchId?: string;
  errorCode?: string;
};

export interface ArenaWorkerServiceDependencies {
  repositories: Pick<ProjectRepository, "listArenaScheduledMatches">;
  seasonService: Pick<ArenaSeasonService, "runScheduledMatch">;
  workerWalletAddress: string;
}

export class ArenaWorkerService {
  private readonly repositories: ArenaWorkerServiceDependencies["repositories"];
  private readonly seasonService: ArenaWorkerServiceDependencies["seasonService"];
  private readonly workerWalletAddress: string;

  constructor(dependencies: ArenaWorkerServiceDependencies) {
    this.repositories = dependencies.repositories;
    this.seasonService = dependencies.seasonService;
    this.workerWalletAddress = dependencies.workerWalletAddress.trim();
  }

  async runNext(input: { projectId: string; seasonId: string }): Promise<ArenaWorkerTickResult> {
    const projectId = input.projectId.trim();
    const seasonId = input.seasonId.trim();
    if (!projectId || !seasonId || !this.workerWalletAddress) {
      return { status: "failed", projectId, seasonId, errorCode: "INVALID_INPUT" };
    }

    const scheduledMatches = await this.repositories.listArenaScheduledMatches(projectId, seasonId);
    const next = scheduledMatches.find((match) => match.status === "scheduled" || match.status === "failed");
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
