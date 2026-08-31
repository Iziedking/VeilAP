import { randomBytes, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import { resolveTournamentRules, tournamentRulesCommitment } from "@/domain/arena/tournament-rules";
import type { AuthChallenge } from "@/server/auth/challenge";
import { ArenaEnrollmentService } from "@/server/arena/arena-enrollment-service";
import { checkArenaDatabaseReadiness } from "@/server/arena/arena-readiness-database";
import { createPreviewKeyProvider } from "@/server/crypto/preview-key-provider";
import { getDatabase } from "./client";
import { createPostgresRepositories, pingDatabase } from "./repositories";

const databaseUrl = process.env.TEST_DATABASE_URL;
const address = (value: string) => `0x${value.padStart(64, "0")}`;
const strategy = (displayName: string, action: "check" | "raise") => ({
  schemaVersion: 1 as const,
  displayName,
  rules: [{ minBoardCards: 0, action }],
  fallbackAction: action,
});

describe.skipIf(!databaseUrl)("Postgres repository integration", () => {
  it("recognizes the complete arena schema", async () => {
    await expect(checkArenaDatabaseReadiness(databaseUrl)).resolves.toEqual({
      database: true,
      arenaSchema: true,
    });
  });

  it("persists and atomically consumes an authentication nonce", async () => {
    const db = getDatabase(databaseUrl);
    await pingDatabase(db);
    const repositories = createPostgresRepositories(db);
    const nonce = `0x${randomBytes(24).toString("hex")}`;
    const challenge = {
      nonce,
      walletAddress: "0x1",
      origin: "http://127.0.0.1:3000",
      chainId: "SN_MAIN",
      issuedAt: "2026-08-27T18:00:00.000Z",
      expiresAt: "2099-08-27T18:05:00.000Z",
      typedData: {},
    } as AuthChallenge;

    try {
      await repositories.nonces.saveNonce({
        nonce,
        walletFingerprint: "integration-fingerprint",
        challenge,
        digest: "integration-digest",
        expiresAt: new Date(challenge.expiresAt),
      });
      const consumed = await repositories.nonces.consumeNonce(nonce, new Date("2026-08-27T18:01:00.000Z"));
      expect(consumed).toMatchObject({ nonce, digest: "integration-digest" });
      await expect(
        repositories.nonces.consumeNonce(nonce, new Date("2026-08-27T18:01:00.000Z")),
      ).resolves.toBe("REPLAYED");
    } finally {
      await db.execute(sql`delete from auth_nonces where nonce = ${nonce}`);
    }
  });

  it("serializes public arena enrollment without orphaning sealed strategies", async () => {
    const db = getDatabase(databaseUrl);
    await pingDatabase(db);
    const repositories = createPostgresRepositories(db);
    const suffix = randomBytes(8).toString("hex");
    const projectId = `arena-pg-${suffix}`;
    const seasonId = `season-pg-${suffix}`;
    const now = new Date("2026-08-30T12:00:00.000Z");
    const keyProvider = createPreviewKeyProvider();
    const wrappedDataKey = await keyProvider.wrap(randomBytes(32), projectId);

    try {
      await repositories.projects.saveProject({
        id: projectId,
        name: "Postgres integration arena",
        ownerFingerprint: `owner-${suffix}`,
        wrappedDataKey,
        createdAt: now,
      });
      await repositories.projects.saveArenaSeason({
        id: seasonId,
        projectId,
        name: "Open integration table",
        rulesetVersion: "holdem.v1",
        startsAt: new Date("2026-08-30T11:00:00.000Z"),
        locksAt: new Date("2026-08-30T13:00:00.000Z"),
        endsAt: new Date("2026-08-30T15:00:00.000Z"),
        status: "open",
        entryMode: "open",
        maxEntries: 2,
        templateId: "playground",
        templateVersion: 1,
        rulesSnapshot: resolveTournamentRules({ templateId: "playground" }),
        rulesCommitment: tournamentRulesCommitment(resolveTournamentRules({ templateId: "playground" })),
        createdBy: `owner-${suffix}`,
        createdAt: now,
      });
      await repositories.projects.saveArenaPrizePool({
        id: `pool-pg-${suffix}`,
        projectId,
        seasonId,
        tokenAddress: address("10"),
        tokenSymbol: "STRK",
        poolAddress: address("20"),
        amountMinor: "1000000",
        sponsorFingerprint: `sponsor-${suffix}`,
        status: "funded",
        fundingTransactionHash: address("30"),
        fundingReceiptDigest: `funding-${suffix}`,
        createdAt: now,
        updatedAt: now,
      });

      const enrollment = new ArenaEnrollmentService({
        repositories: repositories.projects,
        keyProvider,
        walletHashPepper: "postgres-integration-wallet-pepper-001",
        now: () => now,
        idFactory: randomUUID,
      });

      const duplicateWalletResults = await Promise.all([
        enrollment.enroll({
          projectId,
          seasonId,
          actorWalletAddress: address("2"),
          agentId: "EMBER_PG",
          policy: strategy("Ember", "check"),
          idempotencyKey: `join-ember-${suffix}`,
        }),
        enrollment.enroll({
          projectId,
          seasonId,
          actorWalletAddress: address("2"),
          agentId: "NOVA_PG",
          policy: strategy("Nova", "raise"),
          idempotencyKey: `join-nova-${suffix}`,
        }),
      ]);
      expect(duplicateWalletResults.filter((result) => result.ok)).toHaveLength(1);
      const rejectedDuplicate = duplicateWalletResults.find((result) => !result.ok);
      expect(rejectedDuplicate?.ok).toBe(false);
      if (rejectedDuplicate?.ok === false) {
        expect(["ARENA_WALLET_ALREADY_ENTERED", "ARENA_REPLACEMENT_CONFIRMATION_REQUIRED"])
          .toContain(rejectedDuplicate.code);
      }
      await expect(repositories.projects.listArenaSeasonEntries(projectId, seasonId)).resolves.toHaveLength(1);
      await expect(repositories.projects.listArenaStrategyArtifacts(projectId)).resolves.toHaveLength(1);

      const firstEntry = (await repositories.projects.listArenaSeasonEntries(projectId, seasonId))[0]!;
      const replacement = await enrollment.enroll({
        projectId,
        seasonId,
        actorWalletAddress: address("2"),
        agentId: "REPLACED_PG",
        policy: strategy("Replacement", "raise"),
        idempotencyKey: `join-replaced-${suffix}`,
        replaceExisting: true,
      });
      expect(replacement).toMatchObject({ ok: true, value: { agentId: "REPLACED_PG", version: 2 } });
      const versions = await repositories.projects.listArenaEntryVersions(projectId, seasonId, firstEntry.id);
      expect(versions).toMatchObject([
        { version: 1, status: "retired" },
        { version: 2, status: "active", agentId: "REPLACED_PG" },
      ]);

      const capacityResults = await Promise.all([
        enrollment.enroll({
          projectId,
          seasonId,
          actorWalletAddress: address("3"),
          agentId: "CINDER_PG",
          policy: strategy("Cinder", "check"),
          idempotencyKey: `join-cinder-${suffix}`,
        }),
        enrollment.enroll({
          projectId,
          seasonId,
          actorWalletAddress: address("4"),
          agentId: "ORBIT_PG",
          policy: strategy("Orbit", "raise"),
          idempotencyKey: `join-orbit-${suffix}`,
        }),
      ]);
      expect(capacityResults.filter((result) => result.ok)).toHaveLength(1);
      expect(capacityResults.filter((result) => !result.ok)).toEqual([
        { ok: false, code: "ARENA_SEASON_FULL" },
      ]);

      const entries = await repositories.projects.listArenaSeasonEntries(projectId, seasonId);
      const artifacts = await repositories.projects.listArenaStrategyArtifacts(projectId);
      expect(entries).toHaveLength(2);
      expect(artifacts).toHaveLength(3);
      expect(entries.every((entry) => artifacts.some((artifact) => artifact.agentId === entry.agentId))).toBe(true);
    } finally {
      await db.transaction(async (tx) => {
        await tx.execute(sql`delete from audit_events where project_id = ${projectId}`);
        await tx.execute(sql`delete from arena_entry_versions where project_id = ${projectId}`);
        await tx.execute(sql`delete from arena_season_entries where project_id = ${projectId}`);
        await tx.execute(sql`delete from arena_strategy_artifacts where project_id = ${projectId}`);
        await tx.execute(sql`delete from arena_prize_pools where project_id = ${projectId}`);
        await tx.execute(sql`delete from arena_seasons where project_id = ${projectId}`);
        await tx.execute(sql`delete from projects where id = ${projectId}`);
      });
    }
  });
});
