import { describe, expect, it } from "vitest";

import type { AuthChallenge } from "@/server/auth/challenge";
import { createMemoryRepositories } from "./repositories";

const challenge = {
  nonce: "0xnonce",
  walletAddress: "0x1",
  origin: "http://127.0.0.1:3000",
  chainId: "SN_MAIN",
  issuedAt: "2026-08-27T18:00:00.000Z",
  expiresAt: "2026-08-27T18:05:00.000Z",
  typedData: {} as AuthChallenge["typedData"],
} satisfies AuthChallenge;

describe("memory repository contract", () => {
  it("consumes a nonce once and refuses replay", async () => {
    const repositories = createMemoryRepositories();
    await repositories.nonces.saveNonce({
      nonce: challenge.nonce,
      walletFingerprint: "fingerprint",
      challenge,
      digest: "digest",
      expiresAt: new Date(challenge.expiresAt),
    });

    const results = await Promise.all([
      repositories.nonces.consumeNonce(challenge.nonce, new Date("2026-08-27T18:01:00.000Z")),
      repositories.nonces.consumeNonce(challenge.nonce, new Date("2026-08-27T18:01:00.000Z")),
    ]);
    expect(results.filter((result) => result !== "REPLAYED" && result !== undefined)).toHaveLength(1);
    expect(results).toContain("REPLAYED");
  });

  it("keeps projects isolated by id", async () => {
    const repositories = createMemoryRepositories();
    await repositories.projects.saveProject({
      id: "project-alpha",
      name: "Alpha",
      ownerFingerprint: "owner",
      wrappedDataKey: "wrapped-alpha",
      createdAt: new Date("2026-08-27T18:00:00.000Z"),
    });

    await expect(repositories.projects.getProject("project-beta")).resolves.toBeUndefined();
    await expect(repositories.projects.getProject("project-alpha")).resolves.toMatchObject({
      wrappedDataKey: "wrapped-alpha",
    });
  });

  it("keeps settlement preparation and its audit event atomic", async () => {
    const repositories = createMemoryRepositories();
    const now = new Date("2026-08-30T09:00:00.000Z");
    const pool = {
      id: "pool-atomic",
      projectId: "project-atomic",
      seasonId: "season-atomic",
      tokenAddress: "0x123",
      tokenSymbol: "STRK",
      poolAddress: "0x456",
      amountMinor: "1000",
      sponsorFingerprint: "sponsor",
      status: "funded" as const,
      fundingTransactionHash: "0xfunded",
      fundingReceiptDigest: "funded-receipt",
      createdAt: now,
      updatedAt: now,
    };
    const duplicateAudit = {
      id: "audit-duplicate",
      projectId: pool.projectId,
      actorFingerprint: "operator",
      eventType: "existing_event",
      payloadDigest: "existing-digest",
      createdAt: now,
    };
    await repositories.projects.saveArenaPrizePool(pool);
    await repositories.projects.saveAuditEvent(duplicateAudit);

    const pendingPool = {
      ...pool,
      status: "settlement_pending" as const,
      winnerAgentId: "winner",
      recipientFingerprint: "recipient",
      encryptedRecipient: {
        version: 1 as const,
        algorithm: "AES-256-GCM" as const,
        ciphertext: "ciphertext",
        iv: "iv",
        authTag: "auth-tag",
      },
      updatedAt: new Date("2026-08-30T09:01:00.000Z"),
    };
    await expect(repositories.projects.prepareArenaPrizeSettlement({
      pool: pendingPool,
      expectedStatus: "funded",
      audit: duplicateAudit,
    })).rejects.toThrow("AUDIT_EVENT_ALREADY_EXISTS");
    const unchanged = await repositories.projects.getArenaPrizePool(pool.projectId, pool.seasonId);
    expect(unchanged).toMatchObject({ status: "funded" });
    expect(unchanged).not.toHaveProperty("winnerAgentId");

    await expect(repositories.projects.prepareArenaPrizeSettlement({
      pool: pendingPool,
      expectedStatus: "funded",
      audit: { ...duplicateAudit, id: "audit-prepared", eventType: "arena_prize_settlement_prepared" },
    })).resolves.toBeUndefined();
    await expect(repositories.projects.getArenaPrizePool(pool.projectId, pool.seasonId)).resolves.toMatchObject({
      status: "settlement_pending",
      winnerAgentId: "winner",
    });
  });
});
