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
});
