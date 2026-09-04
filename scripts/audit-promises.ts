import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

import { commitment } from "../src/domain/canonical";
import { arenaMatchStartsAt } from "../src/domain/arena/match-schedule";
import { runMatch } from "../src/domain/arena/poker-engine";
import { compileAgentPackage, parseAgentPackage } from "../src/domain/arena/strategy-policy";
import { ArenaWorkerService } from "../src/server/arena/arena-worker-service";
import { ParticipantAgentService } from "../src/server/arena/participant-agent-service";
import { ArenaPrizePoolService } from "../src/server/arena/arena-prize-pool-service";
import { ProjectService } from "../src/server/projects/project-service";
import { createPreviewKeyProvider } from "../src/server/crypto/preview-key-provider";
import { encryptField } from "../src/server/crypto/envelope";
import { fingerprintWallet } from "../src/server/privacy/wallet-fingerprint";
import { createMemoryRepositories, createPostgresRepositories, type ArenaScheduledMatchRecord, type ArenaSeasonRecord, type ProjectRepository } from "../src/server/db/repositories";
import * as schema from "../src/server/db/schema";

// This diagnostic deliberately exits nonzero when a promised invariant fails.
// It does not change application code or connect to production services.
const results: Array<{ check: string; status: "PASS" | "FAIL" | "SKIP"; detail?: string }> = [];
async function check(name: string, work: () => Promise<void> | void) {
  try {
    await work();
    results.push({ check: name, status: "PASS" });
  } catch (error) {
    results.push({ check: name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
}

const createdAt = new Date("2026-09-04T00:00:00Z");
const now = new Date("2026-09-04T01:00:00Z");
const match = (status: ArenaScheduledMatchRecord["status"], seasonId = "season-a"): ArenaScheduledMatchRecord => ({
  id: `match-${seasonId}`, projectId: "audit-project", seasonId, sequence: 1,
  hands: 1, leftAgentId: "LEFT", rightAgentId: "RIGHT", status, attempts: 1,
  createdAt, leaseExpiresAt: new Date("2026-09-04T00:02:00Z"),
});
const season = (id: string): ArenaSeasonRecord => ({
  id, projectId: "audit-project", name: id, rulesetVersion: "holdem-sealed-v0.3",
  startsAt: createdAt, locksAt: createdAt, endsAt: now, status: "locked",
  createdBy: "audit", createdAt,
});
const agentPackage = parseAgentPackage({
  protocolVersion: "veil-agent.v1", engineVersion: "holdem-sealed-v0.3",
  agentId: "AUDIT_AGENT", displayName: "Audit Agent",
  policy: { rules: [{ when: { minHoleRankTotal: 4 }, action: "raise" }], fallbackAction: "fold" },
});
const vault = (repositories: ProjectRepository, sessionSecret = "s".repeat(64)) => new ParticipantAgentService({
  repositories, walletHashPepper: "audit-pepper-".repeat(4), sessionSecret, vaultKeys: { currentKeyId: "test-v1", keys: { "test-v1": "ab".repeat(32) } },
});

async function main() {
  await check("worker reclaims an expired running match", async () => {
    let claims = 0;
    const worker = new ArenaWorkerService({
      repositories: { listAllArenaSeasons: async () => [season("season-a")], listArenaScheduledMatches: async () => [match("running")] },
      seasonService: { runScheduledMatch: async () => { claims++; return { ok: false, code: "PERSISTENCE_FAILED" }; } },
      workerWalletAddress: "0x1", now: () => now,
    });
    const result = await worker.runNext();
    assert.equal(claims, 1, `Expired match was never offered to the claiming service; worker returned ${result.status}`);
  });
  await check("one failed competition does not starve later competitions", async () => {
    const visited: string[] = [];
    const worker = new ArenaWorkerService({
      repositories: {
        listAllArenaSeasons: async () => [season("season-a"), season("season-b")],
        listArenaScheduledMatches: async (_project, id) => [match(id === "season-a" ? "failed" : "scheduled", id)],
      },
      seasonService: { runScheduledMatch: async (input) => { visited.push(input.seasonId); return { ok: false, code: "STRATEGY_ARTIFACT_NOT_FOUND" }; } },
      workerWalletAddress: "0x1", now: () => now,
    });
    for (let tick = 0; tick < 3; tick++) await worker.runNext();
    assert.ok(visited.includes("season-b"), `Three ticks visited only: ${visited.join(", ")}`);
  });
  await check("first match has a positive pre-start countdown", () => {
    assert.ok(arenaMatchStartsAt({ createdAt, sequence: 1 }) > createdAt, "Sequence 1 starts at creation time, without a countdown window");
  });
  await check("public commitments do not disclose every private action", () => {
    const other = parseAgentPackage({ ...agentPackage, agentId: "AUDIT_OTHER" });
    const result = runMatch({ agents: [compileAgentPackage(agentPackage), compileAgentPackage(other)], matchId: "audit-private-actions", seed: "audit-seed", hands: 2 });
    assert.ok(result.ok);
    let recovered = 0;
    let total = 0;
    for (const receipt of result.value.publicHandReceipts) {
      for (const [agentId, digest] of Object.entries(receipt.actionCommitments)) {
        total++;
        if (["fold", "check", "call", "raise"].some((action) => commitment({ agentId, action }) === digest)) recovered++;
      }
    }
    assert.equal(recovered, 0, `Recovered ${recovered}/${total} private actions using four guesses each from public data alone`);
  });
  await check("unknown executable fields are rejected before storage", async () => {
    await assert.rejects(vault(createMemoryRepositories().projects).save({
      actorWalletAddress: "0x1", agentPackage: { ...agentPackage, executable: "untrusted-code" },
    }), /AGENT_PACKAGE_INVALID/);
  });
  await check("saved packages survive session-signing-secret rotation", async () => {
    const repositories = createMemoryRepositories().projects;
    await vault(repositories).save({ actorWalletAddress: "0x1", agentPackage });
    const reopened = await vault(repositories, "r".repeat(64)).open({ actorWalletAddress: "0x1", agentId: agentPackage.agentId });
    assert.deepEqual(reopened?.agentPackage, agentPackage);
  });
  await check("a tied match does not block rewards for a clear season winner", async () => {
    const repositories = createMemoryRepositories().projects;
    const keyProvider = createPreviewKeyProvider();
    const pepper = "audit-reward-pepper-".repeat(3);
    const projectResult = await new ProjectService({ repositories, keyProvider, walletHashPepper: pepper })
      .createProject({ name: "Audit reward", walletAddress: "0x1" });
    assert.ok(projectResult.ok);
    const project = await repositories.getProject(projectResult.value.id);
    assert.ok(project);
    const keyMaterial = { dataKey: await keyProvider.unwrap(project.wrappedDataKey, project.id), wrappedKey: project.wrappedDataKey };
    await repositories.saveArenaSeason({ ...season("reward-season"), projectId: project.id });
    await repositories.saveArenaSeasonEntry({
      id: "audit-winner", projectId: project.id, seasonId: "reward-season", agentId: "LEFT", displayName: "Left",
      artifactCommitment: "audit-left", ownerFingerprint: fingerprintWallet("0x2", pepper), version: 1, joinedAt: now,
      encryptedPayoutWallet: encryptField("0x2", { projectId: project.id, recordType: "arena_season_entry", recordId: "audit-winner", fieldName: "payout_wallet" }, keyMaterial),
    });
    for (const [index, score] of [{ LEFT: 3, RIGHT: -1 }, { LEFT: 1, RIGHT: 1 }].entries()) {
      const id = `audit-reward-${index}`;
      await repositories.saveArenaScheduledMatch({ ...match("completed", "reward-season"), id, projectId: project.id, sequence: index + 1, matchId: id });
      await repositories.saveArenaMatchReceipt({
        id, projectId: project.id, leftAgentId: "LEFT", rightAgentId: "RIGHT", leftDisplayName: "Left", rightDisplayName: "Right",
        publicReceipt: { artifactCommitments: { LEFT: "audit-left", RIGHT: "audit-right" }, engineVersion: "holdem-sealed-v0.3", matchId: id, score, seedCommitment: "audit-seed", transcriptRoot: "audit-root" },
        encryptedSeed: encryptField("audit", { projectId: project.id, recordType: "arena_match", recordId: id, fieldName: "seed" }, keyMaterial),
        status: "completed", createdAt: now,
      });
    }
    await repositories.saveArenaPrizePool({
      id: "audit-reward-pool", projectId: project.id, seasonId: "reward-season", tokenAddress: "0x10", tokenSymbol: "STRK",
      poolAddress: "0x20", amountMinor: "1", sponsorFingerprint: fingerprintWallet("0x1", pepper), status: "funded", createdAt: now, updatedAt: now,
    });
    const rewards = new ArenaPrizePoolService({
      repositories, keyProvider, walletHashPepper: pepper, poolAddress: "0x20",
      receiptProvider: { getTransactionReceipt: async () => { throw new Error("AUDIT_MUST_NOT_CALL_CHAIN"); }, getTransactionTrace: async () => { throw new Error("AUDIT_MUST_NOT_CALL_CHAIN"); } },
      verifySignature: async () => { throw new Error("AUDIT_MUST_NOT_SIGN"); },
    });
    const prepared = await rewards.prepareSettlement({ projectId: project.id, seasonId: "reward-season", actorWalletAddress: "0x1" });
    assert.ok(prepared.ok, `Left has one win and one tie, but settlement returned ${prepared.ok ? "success" : prepared.code}`);
    assert.equal(prepared.value.winnerAgentId, "LEFT");
  });

  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    results.push({ check: "PostgreSQL persistence and concurrent first-save checks", status: "SKIP", detail: "Set TEST_DATABASE_URL to a disposable local veil_promise_audit database" });
  } else {
    const target = new URL(databaseUrl);
    if (target.hostname !== "127.0.0.1" || target.pathname !== "/veil_promise_audit") {
      throw new Error("AUDIT_REFUSES_NON_DISPOSABLE_DATABASE");
    }
    const pool = new Pool({ connectionString: databaseUrl });
    try {
      const repositories = createPostgresRepositories(drizzle(pool, { schema })).projects;
      const owner = `0x${randomUUID().replaceAll("-", "")}`;
      await check("saved agent survives fresh service construction and stays owner-only", async () => {
        await vault(repositories).save({ actorWalletAddress: owner, agentPackage });
        const fresh = vault(repositories);
        assert.deepEqual((await fresh.open({ actorWalletAddress: owner, agentId: agentPackage.agentId }))?.agentPackage, agentPackage);
        assert.equal(await fresh.open({ actorWalletAddress: "0x999", agentId: agentPackage.agentId }), null);
        assert.equal((await fresh.list(owner)).length, 1);
      });
      await check("concurrent replacements commit distinct versions and remain decryptable", async () => {
        const owner = `0x${randomUUID().replaceAll("-", "")}`;
        const first = await vault(repositories).save({ actorWalletAddress: owner, agentPackage });
        const replacements = await Promise.all(["Second", "Third"].map((displayName) => vault(repositories).save({ actorWalletAddress: owner, agentPackage: { ...agentPackage, displayName } })));
        assert.deepEqual(replacements.map((saved) => saved.version).sort(), [2, 3]);
        assert.ok(replacements.every((saved) => saved.id === first.id));
        const opened = await vault(repositories).open({ actorWalletAddress: owner, agentId: agentPackage.agentId });
        assert.equal(opened?.view.version, 3);
        assert.equal(opened?.agentPackage.displayName, replacements.find((saved) => saved.version === 3)?.displayName);
        const rotating = new ParticipantAgentService({ repositories, walletHashPepper: "audit-pepper-".repeat(4), sessionSecret: "r".repeat(64), vaultKeys: { currentKeyId: "test-v2", keys: { "test-v1": "ab".repeat(32), "test-v2": "cd".repeat(32) } } });
        await rotating.rewrap({ actorWalletAddress: owner, agentId: agentPackage.agentId });
        assert.deepEqual((await rotating.open({ actorWalletAddress: owner, agentId: agentPackage.agentId }))?.view, opened?.view);
      });
      await check("concurrent first saves leave one decryptable package", async () => {
        const racingOwner = `0x${randomUUID().replaceAll("-", "")}`;
        let readers = 0;
        let release!: () => void;
        const barrier = new Promise<void>((resolve) => { release = resolve; });
        const racingRepositories: ProjectRepository = {
          ...repositories,
          getParticipantAgentPackage: async (fingerprint, agentId) => {
            const existing = await repositories.getParticipantAgentPackage(fingerprint, agentId);
            if (++readers === 2) release();
            await barrier;
            return existing;
          },
        };
        await Promise.all([
          vault(racingRepositories).save({ actorWalletAddress: racingOwner, agentPackage }),
          vault(racingRepositories).save({ actorWalletAddress: racingOwner, agentPackage }),
        ]);
        const fresh = vault(repositories);
        assert.equal((await fresh.list(racingOwner)).length, 1);
        assert.deepEqual((await fresh.open({ actorWalletAddress: racingOwner, agentId: agentPackage.agentId }))?.agentPackage, agentPackage);
      });
    } finally {
      await pool.end();
    }
  }
  process.stdout.write(`${JSON.stringify({ audit: "Veil Arena promise audit", results }, null, 2)}\n`);
  process.exitCode = results.some((result) => result.status !== "PASS") ? 1 : 0;
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
