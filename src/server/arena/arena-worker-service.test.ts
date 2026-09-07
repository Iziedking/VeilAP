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
  it("runs due tables concurrently within the configured batch limit", async () => {
    let active = 0;
    let peak = 0;
    const completed: string[] = [];
    const service = new ArenaWorkerService({
      repositories: {
        listAllArenaSeasons: async () => [],
        listArenaScheduledMatches: async () => [
          scheduled("match-1", "scheduled"),
          scheduled("match-2", "scheduled"),
          scheduled("match-3", "scheduled"),
        ],
      },
      seasonService: {
        runScheduledMatch: async (input: { scheduledMatchId: string }) => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
          completed.push(input.scheduledMatchId);
          return { ok: true, value: { matchId: `receipt-${input.scheduledMatchId}` } as never };
        },
      },
      workerWalletAddress: "0xworker",
      maxConcurrentMatches: 2,
    });

    const result = await service.runDueBatch({ projectId: "project-1", seasonId: "season-1" });
    expect(result.status).toBe("completed");
    expect(result.results).toHaveLength(2);
    expect(peak).toBe(2);
    expect(completed.sort()).toEqual(["match-1", "match-2"]);
  });

  it("shares a global batch across due competitions before taking another table", async () => {
    const calls: string[] = [];
    const service = new ArenaWorkerService({
      repositories: {
        listAllArenaSeasons: async () => [
          { projectId: "project-one", id: "season-one", status: "locked", lockedAt: new Date("2026-08-30T00:01:00.000Z"), createdAt: new Date("2026-08-30T00:00:00.000Z") },
          { projectId: "project-two", id: "season-two", status: "locked", lockedAt: new Date("2026-08-30T00:02:00.000Z"), createdAt: new Date("2026-08-30T00:00:00.000Z") },
        ] as never,
        listArenaScheduledMatches: async (projectId) => [1, 2, 3].map((sequence) => ({
          ...scheduled(`match-${sequence}`, "scheduled"),
          projectId,
          seasonId: projectId === "project-one" ? "season-one" : "season-two",
        })),
      },
      seasonService: {
        runScheduledMatch: async (input: { projectId: string; scheduledMatchId: string }) => {
          calls.push(`${input.projectId}:${input.scheduledMatchId}`);
          return { ok: true, value: { matchId: `receipt-${input.projectId}-${input.scheduledMatchId}` } as never };
        },
      },
      workerWalletAddress: "0xworker",
      maxConcurrentMatches: 3,
    });

    const result = await service.runDueBatch();
    expect(result.status).toBe("completed");
    expect(calls).toEqual(["project-one:match-1", "project-two:match-1", "project-one:match-2"]);
  });

  it("runs the next scheduled pairing with a stable worker idempotency key", async () => {
    const calls: Array<{ scheduledMatchId: string; actorWalletAddress: string; idempotencyKey: string }> = [];
    const service = new ArenaWorkerService({
      repositories: {
        listAllArenaSeasons: async () => [],
        listArenaScheduledMatches: async () => [scheduled("match-1", "scheduled"), scheduled("match-2", "failed")],
      },
      seasonService: {
        runScheduledMatch: async (input: { scheduledMatchId: string; actorWalletAddress: string; idempotencyKey: string }) => {
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
        runScheduledMatch: async (input: { projectId: string; seasonId: string; scheduledMatchId: string }) => {
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

  it("locks a due open competition before running its first match", async () => {
    const lockCalls: Array<{ projectId: string; seasonId: string; actorWalletAddress: string; idempotencyKey: string; automatic: boolean }> = [];
    const runCalls: string[] = [];
    const service = new ArenaWorkerService({
      repositories: {
        listAllArenaSeasons: async () => [{
          projectId: "project-1",
          id: "season-1",
          status: "open",
          locksAt: new Date("2026-08-30T12:00:00.000Z"),
          createdAt: new Date("2026-08-30T00:00:00.000Z"),
        }] as never,
        listArenaScheduledMatches: async () => [scheduled("match-1", "scheduled")],
      },
      seasonService: {
        lockSeason: async (input: { projectId: string; seasonId: string; actorWalletAddress: string; idempotencyKey: string; automatic: boolean }) => {
          lockCalls.push(input);
          return { ok: true, value: {} as never };
        },
        runScheduledMatch: async (input: { scheduledMatchId: string }) => {
          runCalls.push(input.scheduledMatchId);
          return { ok: true, value: { matchId: "receipt-1" } as never };
        },
      } as never,
      workerWalletAddress: "0xworker",
      now: () => new Date("2026-08-30T13:00:00.000Z"),
    });

    await expect(service.runNext()).resolves.toMatchObject({
      status: "completed",
      projectId: "project-1",
      seasonId: "season-1",
      scheduledMatchId: "match-1",
    });
    expect(lockCalls).toEqual([{
      projectId: "project-1",
      seasonId: "season-1",
      actorWalletAddress: "0xworker",
      idempotencyKey: "auto-lock-season-1",
      automatic: true,
    }]);
    expect(runCalls).toEqual(["match-1"]);
  });

  it("expires a due empty competition instead of leaving it open", async () => {
    const expireCalls: string[] = [];
    const service = new ArenaWorkerService({
      repositories: {
        listAllArenaSeasons: async () => [{
          projectId: "project-empty",
          id: "season-empty",
          status: "open",
          locksAt: new Date("2026-08-30T12:00:00.000Z"),
          createdAt: new Date("2026-08-30T00:00:00.000Z"),
        }] as never,
        listArenaScheduledMatches: async () => [],
      },
      seasonService: {
        expireEmptySeason: async (input: { projectId: string; seasonId: string; actorWalletAddress: string; idempotencyKey: string }) => {
          expireCalls.push(`${input.projectId}:${input.seasonId}:${input.idempotencyKey}`);
          return { ok: true, value: { expired: true } };
        },
        lockSeason: async () => { throw new Error("LOCK_SHOULD_NOT_RUN"); },
        runScheduledMatch: async () => ({ ok: false, code: "PERSISTENCE_FAILED" }),
      } as never,
      workerWalletAddress: "0xworker",
      now: () => new Date("2026-08-30T13:00:00.000Z"),
    });

    await expect(service.runDueBatch()).resolves.toEqual({ status: "idle", results: [] });
    expect(expireCalls).toEqual(["project-empty:season-empty:auto-expire-season-empty"]);
  });

  it("keeps expected auto-lock blocks from poisoning the worker heartbeat", async () => {
    const service = new ArenaWorkerService({
      repositories: {
        listAllArenaSeasons: async () => [{
          projectId: "project-1",
          id: "season-1",
          status: "open",
          locksAt: new Date("2026-08-30T12:00:00.000Z"),
          createdAt: new Date("2026-08-30T00:00:00.000Z"),
        }] as never,
        listArenaScheduledMatches: async () => [],
      },
      seasonService: {
        lockSeason: async () => ({ ok: false, code: "ARENA_SEASON_TOO_SMALL" }),
        runScheduledMatch: async () => ({ ok: false, code: "PERSISTENCE_FAILED" }),
      } as never,
      workerWalletAddress: "0xworker",
      now: () => new Date("2026-08-30T13:00:00.000Z"),
    });

    await expect(service.runNext()).resolves.toEqual({
      status: "idle",
      projectId: "",
      seasonId: "",
    });
  });

  it("keeps expected auto-lock blocks out of the due-batch failure status", async () => {
    const service = new ArenaWorkerService({
      repositories: {
        listAllArenaSeasons: async () => [{
          projectId: "project-1",
          id: "season-1",
          status: "open",
          locksAt: new Date("2026-08-30T12:00:00.000Z"),
          createdAt: new Date("2026-08-30T00:00:00.000Z"),
        }] as never,
        listArenaScheduledMatches: async () => [],
      },
      seasonService: {
        lockSeason: async () => ({ ok: false, code: "ARENA_SEASON_TOO_SMALL" }),
        runScheduledMatch: async () => ({ ok: false, code: "PERSISTENCE_FAILED" }),
      } as never,
      workerWalletAddress: "0xworker",
      now: () => new Date("2026-08-30T13:00:00.000Z"),
    });

    await expect(service.runDueBatch()).resolves.toEqual({
      status: "idle",
      results: [],
    });
  });
});
