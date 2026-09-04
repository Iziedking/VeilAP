import { afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/server/db/schema";
import { createMemoryRepositories, createPostgresRepositories, type ProjectRepository, type ArenaScheduledMatchRecord } from "@/server/db/repositories";
import { encryptField } from "@/server/crypto/envelope";
import { eligibleMatch, queueState, retryAt } from "@/domain/arena/queue-policy";

const url = process.env.TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (target.hostname !== "127.0.0.1" || !["/veil_promise_audit", "/veil_arena_ci"].includes(target.pathname)) throw new Error("TEST_DATABASE_NOT_DISPOSABLE");
}
const pool = url ? new Pool({ connectionString: url }) : undefined;
afterAll(async () => { await pool?.end(); });
const factories = [
  { name: "memory", make: () => createMemoryRepositories().projects, enabled: true },
  { name: "PostgreSQL", make: () => createPostgresRepositories(drizzle(pool!, { schema })).projects, enabled: Boolean(pool) },
];
for (const factory of factories) describe.skipIf(!factory.enabled)(factory.name + " worker recovery", () => {
  it("enforces eligibility, exclusive claims, stable retry seed and stale terminal fences", async () => {
    const repo: ProjectRepository = factory.make();
    const now = new Date("2026-09-04T00:00:00Z");
    const id = randomUUID();
    const base: ArenaScheduledMatchRecord = { id, projectId: id, seasonId: id, sequence: 1, hands: 2, leftAgentId: "LEFT", rightAgentId: "RIGHT", attempts: 0, status: "scheduled", createdAt: now };
    await repo.saveArenaScheduledMatch(base);
    const encryptedSeed = encryptField("private-seed", { projectId: id, recordType: "test", recordId: id, fieldName: "seed" }, new Uint8Array(32));
    const input = { projectId: id, seasonId: id, scheduledMatchId: id, now, leaseMs: 1000, executionIdempotencyKey: "test-claim", executionRequestDigest: "test-digest", encryptedSeed };
    const early = await repo.claimArenaScheduledMatch(input);
    expect(typeof early === "object").toBe(false);
    input.now = new Date(now.getTime() + 10_000);
    const claims = await Promise.all([repo.claimArenaScheduledMatch(input), repo.claimArenaScheduledMatch(input)]);
    const first = claims.find((value) => typeof value === "object");
    expect(claims.filter((value) => typeof value === "object")).toHaveLength(1);
    if (!first || typeof first !== "object") throw new Error("CLAIM_MISSING");
    const fresh = factory.name === "PostgreSQL" ? factory.make() : repo;
    const recovered = await fresh.claimArenaScheduledMatch({ ...input, now: new Date(input.now.getTime() + 1000), encryptedSeed: encryptField("different", { projectId: id, recordType: "test", recordId: id, fieldName: "seed" }, new Uint8Array(32)) });
    if (!recovered || typeof recovered !== "object") throw new Error("RECOVERY_MISSING");
    expect(recovered.attempts).toBe(2);
    expect(recovered.encryptedSeed).toEqual(encryptedSeed);
    await expect(repo.updateArenaScheduledMatch({ ...first, status: "completed" })).rejects.toThrow("LEASE_LOST");
    const receipt = { id: randomUUID(), projectId: id, leftAgentId: "LEFT", rightAgentId: "RIGHT", leftDisplayName: "Left", rightDisplayName: "Right", publicReceipt: {}, encryptedSeed, status: "completed" as const, createdAt: input.now };
    await expect(repo.saveArenaMatchReceipt(receipt, { scheduledMatchId: id, attempts: first.attempts, now: input.now })).rejects.toThrow("LEASE_LOST");
    await repo.updateArenaScheduledMatch({ ...recovered, status: "failed", retryAt: retryAt(input.now, 2) });
    expect(typeof await repo.claimArenaScheduledMatch({ ...input, now: new Date(input.now.getTime() + 2000) })).not.toBe("object");
    const last = await repo.claimArenaScheduledMatch({ ...input, now: retryAt(input.now, 2) });
    if (!last || typeof last !== "object") throw new Error("RETRY_MISSING");
    await repo.updateArenaScheduledMatch({ ...last, status: "failed" });
    expect(typeof await repo.claimArenaScheduledMatch({ ...input, now: new Date(input.now.getTime() + 60_000) })).not.toBe("object");
    expect(queueState((await repo.getArenaScheduledMatch(id, id, id))!, input.now)).toBe("failed");
  });
});
it("shows eligibility and capacity waiting without promising a reservation", () => {
  const createdAt = new Date("2026-09-04T00:00:00Z");
  const match = { status: "scheduled", attempts: 0, sequence: 1, createdAt };
  expect(queueState(match, createdAt)).toBe("queued");
  const due = new Date(createdAt.getTime() + 10_000);
  expect(queueState(match, due)).toBe("waiting_for_capacity");
  expect(eligibleMatch(match, due)).toBe(true);
  expect(eligibleMatch({ ...match, status: "running", leaseExpiresAt: due }, due)).toBe(true);
});
