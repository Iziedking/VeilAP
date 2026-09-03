import { describe, expect, it } from "vitest";

import type { ArenaScheduledMatchRecord } from "@/server/db/repositories";

import { ArenaWorkerService } from "./arena-worker-service";

const scheduled = (id: string, status: ArenaScheduledMatchRecord["status"]): ArenaScheduledMatchRecord => ({
  id,
  seasonId: "season-1",
  projectId: "project-1",
  sequence: Number(id.replace("match-", "")),
  hands: 18,
  leftAgentId: "CINDER",
  rightAgentId: "EMBER",
  status,
  attempts: 0,
  createdAt: new Date("2026-08-30T00:00:00.000Z"),
});

describe("ArenaWorkerService", () => {
  it("runs the next scheduled pairing with a stable worker idempotency key", async () => {
    const calls: Array<{ scheduledMatchId: string; actorWalletAddress: string; idempotencyKey: string }> = [];
    const service = new ArenaWorkerService({
      repositories: {
        listAllArenaSeasons: async () => [],
        listArenaScheduledMatches: async () => [scheduled("match-1", "scheduled"), scheduled("match-2", "failed")],
      },
      seasonService: {
        runScheduledMatch: async (input) => {
          calls.push({ scheduledMatchId: input.scheduledMatchId, actorWalletAddress: input.actorWalletAddress, idempotencyKey: input.idempotencyKey });
          return { ok: true, value: { matchId: "receipt-1" } as never };
        },
      },
      workerWalletAddress: "0xworker",
    });

    await expect(service.runNext({ projectId: "project-1", seasonId: "season-1" })).resolves.toEqual({
      status: "completed",
      projectId: "project-1",
      seasonId: "season-1",
      scheduledMatchId: "match-1",
      matchId: "receipt-1",
    });
    expect(calls).toEqual([{ scheduledMatchId: "match-1", actorWalletAddress: "0xworker", idempotencyKey: "worker-match-1" }]);
  });

  it("returns idle when a season has no runnable pairings", async () => {
    const service = new ArenaWorkerService({
      repositories: {
        listAllArenaSeasons: async () => [],
        listArenaScheduledMatches: async () => [scheduled("match-1", "completed")],
      },
      seasonService: { runScheduledMatch: async () => ({ ok: false, code: "PERSISTENCE_FAILED" }) },
      workerWalletAddress: "0xworker",
    });

    await expect(service.runNext({ projectId: "project-1", seasonId: "season-1" })).resolves.toEqual({
      status: "idle",
      projectId: "project-1",
      seasonId: "season-1",
    });
  });

  it("waits for a queued match start window", async () => {
    const service = new ArenaWorkerService({
      repositories: {
        listAllArenaSeasons: async () => [],
        listArenaScheduledMatches: async () => [scheduled("match-2", "scheduled")],
      },
      seasonService: { runScheduledMatch: async () => ({ ok: true, value: { matchId: "receipt-2" } as never }) },
      workerWalletAddress: "0xworker",
      now: () => new Date("2026-08-30T00:00:00.000Z"),
    });

    await expect(service.runNext({ projectId: "project-1", seasonId: "season-1" })).resolves.toEqual({
      status: "idle",
      projectId: "project-1",
      seasonId: "season-1",
    });
  });

  it("discovers the next runnable match across locked competitions", async () => {
    const calls: string[] = [];
    const service = new ArenaWorkerService({
      repositories: {
        listAllArenaSeasons: async () => [
          { projectId: "project-open", id: "season-open", status: "open", createdAt: new Date("2026-08-30T00:00:00.000Z") },
          { projectId: "project-two", id: "season-two", status: "locked", createdAt: new Date("2026-08-30T00:02:00.000Z") },
          { projectId: "project-one", id: "season-one", status: "locked", createdAt: new Date("2026-08-30T00:01:00.000Z") },
        ] as never,
        listArenaScheduledMatches: async (projectId) => projectId === "project-one"
          ? [scheduled("match-1", "completed")]
          : [{ ...scheduled("match-2", "scheduled"), projectId: "project-two", seasonId: "season-two" }],
      },
      seasonService: {
        runScheduledMatch: async (input) => {
          calls.push(`${input.projectId}:${input.seasonId}:${input.scheduledMatchId}`);
          return { ok: true, value: { matchId: "receipt-two" } as never };
        },
      },
      workerWalletAddress: "0xworker",
    });

    await expect(service.runNext()).resolves.toMatchObject({
      status: "completed",
      projectId: "project-two",
      seasonId: "season-two",
      scheduledMatchId: "match-2",
    });
    expect(calls).toEqual(["project-two:season-two:match-2"]);
  });
});
