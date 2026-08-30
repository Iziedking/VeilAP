import { describe, expect, it } from "vitest";

import { createPreviewKeyProvider } from "@/server/crypto/preview-key-provider";
import { encryptField } from "@/server/crypto/envelope";
import { createMemoryRepositories } from "@/server/db/repositories";
import { ProjectService } from "@/server/projects/project-service";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";
import {
  ARENA_TRANSFER_AUTHORIZATION_TTL_MS,
  createArenaTransferAuthorization,
  type ArenaTransferPlan,
} from "@/domain/arena/transfer-authorization";

import { ArenaPrizePoolService } from "./arena-prize-pool-service";

const address = (value: string) => `0x${value.padStart(64, "0")}`;
const company = address("1");

function confirmation(plan: ArenaTransferPlan, transactionHash: string, now: Date) {
  return {
    authorization: createArenaTransferAuthorization(plan, transactionHash, now.getTime()),
    signature: ["0x1", "0x2"],
  };
}

describe("ArenaPrizePoolService", () => {
  it("derives the winner payout from the wallet bound at enrollment", async () => {
    const repositories = createMemoryRepositories();
    const keyProvider = createPreviewKeyProvider();
    const walletHashPepper = "test-wallet-pepper-0123456789012345";
    const projectService = new ProjectService({
      repositories: repositories.projects,
      keyProvider,
      walletHashPepper,
    });
    const project = await projectService.createProject({ name: "Owner bound payout", walletAddress: company });
    if (!project.ok) throw new Error(project.code);
    const projectRecord = await repositories.projects.getProject(project.value.id);
    if (!projectRecord) throw new Error("PROJECT_MISSING");
    const dataKey = await keyProvider.unwrap(projectRecord.wrappedDataKey, project.value.id);
    const keyMaterial = { dataKey, wrappedKey: projectRecord.wrappedDataKey };
    const now = new Date("2026-08-30T00:00:00.000Z");
    const winnerWallet = address("2");

    await repositories.projects.saveArenaSeason({
      id: "owner-bound-season",
      projectId: project.value.id,
      name: "Owner bound season",
      rulesetVersion: "holdem.v1",
      startsAt: now,
      locksAt: now,
      endsAt: new Date(now.getTime() + 86_400_000),
      status: "locked",
      entryMode: "open",
      maxEntries: 2,
      createdBy: "owner",
      createdAt: now,
      lockedAt: now,
    });
    await repositories.projects.saveArenaSeasonEntry({
      id: "winner-entry",
      seasonId: "owner-bound-season",
      projectId: project.value.id,
      agentId: "CINDER",
      displayName: "Cinder",
      artifactCommitment: "cinder-artifact",
      ownerFingerprint: fingerprintWallet(winnerWallet, walletHashPepper),
      encryptedPayoutWallet: encryptField(
        winnerWallet,
        { projectId: project.value.id, recordType: "arena_season_entry", recordId: "winner-entry", fieldName: "payout_wallet" },
        keyMaterial,
      ),
      joinedAt: now,
    });
    await repositories.projects.saveArenaScheduledMatch({
      id: "scheduled-owner-bound",
      seasonId: "owner-bound-season",
      projectId: project.value.id,
      sequence: 1,
      hands: 2,
      leftAgentId: "CINDER",
      rightAgentId: "EMBER",
      status: "completed",
      matchId: "match-owner-bound",
      attempts: 1,
      completedAt: now,
      createdAt: now,
    });
    await repositories.projects.saveArenaMatchReceipt({
      id: "match-owner-bound",
      projectId: project.value.id,
      leftAgentId: "CINDER",
      rightAgentId: "EMBER",
      leftDisplayName: "Cinder",
      rightDisplayName: "Ember",
      publicReceipt: {
        artifactCommitments: { CINDER: "cinder-artifact", EMBER: "ember-artifact" },
        engineVersion: "holdem.v1",
        matchId: "match-owner-bound",
        score: { CINDER: 2, EMBER: 0 },
        seedCommitment: "seed-commitment",
        transcriptRoot: "transcript-root",
      },
      encryptedSeed: encryptField(
        "seed",
        { projectId: project.value.id, recordType: "arena_match_receipt", recordId: "match-owner-bound", fieldName: "seed" },
        keyMaterial,
      ),
      status: "completed",
      createdAt: now,
    });
    await repositories.projects.saveArenaPrizePool({
      id: "owner-bound-pool",
      projectId: project.value.id,
      seasonId: "owner-bound-season",
      tokenAddress: "0x123",
      tokenSymbol: "USDC",
      poolAddress: "0xabc",
      amountMinor: "50",
      sponsorFingerprint: fingerprintWallet(company, walletHashPepper),
      status: "funded",
      fundingTransactionHash: "0x111",
      fundingReceiptDigest: "funding-receipt",
      createdAt: now,
      updatedAt: now,
    });
    const service = new ArenaPrizePoolService({
      repositories: repositories.projects,
      keyProvider,
      receiptProvider: {
        async getTransactionReceipt() { return {}; },
        async getTransactionTrace() { return {}; },
      },
      poolAddress: "0xabc",
      walletHashPepper,
      verifySignature: async () => true,
      now: () => now,
      idFactory: () => "owner-bound-audit",
    });

    await expect(service.prepareSettlement({
      projectId: project.value.id,
      seasonId: "owner-bound-season",
      actorWalletAddress: company,
    })).resolves.toEqual({
      ok: true,
      value: expect.objectContaining({
        status: "settlement_pending",
        winnerAgentId: "CINDER",
        recipientFingerprint: fingerprintWallet(winnerWallet, walletHashPepper),
      }),
    });
    await expect(service.getSettlementTransactionPlan({
      projectId: project.value.id,
      seasonId: "owner-bound-season",
      actorWalletAddress: company,
    })).resolves.toEqual({
      ok: true,
      value: expect.objectContaining({ recipient: "0x2" }),
    });
  });

  it("rechecks the same transaction after an uncertain funding or settlement result", async () => {
    const repositories = createMemoryRepositories();
    const keyProvider = createPreviewKeyProvider();
    const projectService = new ProjectService({
      repositories: repositories.projects,
      keyProvider,
      walletHashPepper: "test-wallet-pepper-0123456789012345",
    });
    const project = await projectService.createProject({ name: "Prize pool retry", walletAddress: company });
    if (!project.ok) throw new Error(project.code);

    const now = new Date("2026-08-30T00:00:00.000Z");
    await repositories.projects.saveArenaSeason({
      id: "season-1",
      projectId: project.value.id,
      name: "Retry season",
      rulesetVersion: "holdem.v1",
      startsAt: now,
      locksAt: now,
      endsAt: new Date(now.getTime() + 86_400_000),
      status: "locked",
      createdBy: "owner",
      createdAt: now,
      lockedAt: now,
    });

    let phase: "funding" | "settlement" = "funding";
    let uncertainChecks = 0;
    let signatureValid = true;
    const receiptProvider = {
      async getTransactionReceipt() {
        if (phase === "settlement" && uncertainChecks < 3) {
          uncertainChecks += 1;
          return { execution_status: "PENDING" };
        }
        return {
          execution_status: "SUCCEEDED",
          finality_status: "ACCEPTED_ON_L2",
        };
      },
      async getTransactionTrace() {
        return { execute_invocation: { contract_address: "0xabc", is_reverted: false } };
      },
    };
    const service = new ArenaPrizePoolService({
      repositories: repositories.projects,
      keyProvider,
      receiptProvider,
      poolAddress: "0xabc",
      walletHashPepper: "test-wallet-pepper-0123456789012345",
      verifySignature: async () => signatureValid,
      now: () => now,
      idFactory: (() => {
        let count = 0;
        return () => `id-${++count}`;
      })(),
    });

    const created = await service.createPool({
      projectId: project.value.id,
      seasonId: "season-1",
      actorWalletAddress: company,
      tokenAddress: "0x123",
      tokenSymbol: "USDC",
      amountMinor: "50",
      idempotencyKey: "pool-create-1",
    });
    expect(created.ok).toBe(true);

    const fundingPlan = await service.getFundingTransactionPlan({
      projectId: project.value.id,
      seasonId: "season-1",
      actorWalletAddress: company,
    });
    expect(fundingPlan).toEqual({
      ok: true,
      value: expect.objectContaining({
        network: "SN_MAIN",
        operation: "strk20_shield",
        tokenAddress: "0x123",
        tokenSymbol: "USDC",
        amountMinor: "50",
        recipient: "0x1",
        poolAddress: "0xabc",
        planDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    });
    if (!fundingPlan.ok) throw new Error(fundingPlan.code);

    const fundingHash = "0x111";
    const altered = confirmation(fundingPlan.value, fundingHash, now);
    altered.authorization.amountMinor = "51";
    await expect(service.confirmFunding({
      projectId: project.value.id,
      seasonId: "season-1",
      actorWalletAddress: company,
      confirmation: altered,
    })).resolves.toEqual({ ok: false, code: "TRANSFER_PLAN_MISMATCH" });

    await expect(service.confirmFunding({
      projectId: project.value.id,
      seasonId: "season-1",
      actorWalletAddress: company,
      confirmation: confirmation(
        fundingPlan.value,
        fundingHash,
        new Date(now.getTime() - ARENA_TRANSFER_AUTHORIZATION_TTL_MS - 1),
      ),
    })).resolves.toEqual({ ok: false, code: "TRANSFER_AUTHORIZATION_EXPIRED" });

    signatureValid = false;
    await expect(service.confirmFunding({
      projectId: project.value.id,
      seasonId: "season-1",
      actorWalletAddress: company,
      confirmation: confirmation(fundingPlan.value, fundingHash, now),
    })).resolves.toEqual({ ok: false, code: "SIGNATURE_INVALID" });
    signatureValid = true;
    await expect(service.confirmFunding({
      projectId: project.value.id,
      seasonId: "season-1",
      actorWalletAddress: company,
      confirmation: confirmation(fundingPlan.value, fundingHash, now),
    })).resolves.toEqual({ ok: true, value: expect.objectContaining({ status: "funded" }) });
    await expect(service.confirmFunding({
      projectId: project.value.id,
      seasonId: "season-1",
      actorWalletAddress: company,
      confirmation: confirmation(fundingPlan.value, fundingHash, now),
    })).resolves.toEqual({ ok: true, value: expect.objectContaining({ status: "funded" }) });
    await expect(service.confirmFunding({
      projectId: project.value.id,
      seasonId: "season-1",
      actorWalletAddress: company,
      confirmation: confirmation(fundingPlan.value, "0x112", now),
    })).resolves.toEqual({ ok: false, code: "TRANSACTION_ALREADY_USED" });

    const funded = await repositories.projects.getArenaPrizePool(project.value.id, "season-1");
    if (!funded) throw new Error("POOL_MISSING");
    const recipient = address("2");
    const projectRecord = await repositories.projects.getProject(project.value.id);
    if (!projectRecord) throw new Error("PROJECT_MISSING");
    const dataKey = await keyProvider.unwrap(projectRecord.wrappedDataKey, project.value.id);
    await repositories.projects.updateArenaPrizePool({
      ...funded,
      status: "settlement_pending",
      winnerAgentId: "CINDER",
      encryptedRecipient: encryptField(recipient, { projectId: project.value.id, recordType: "arena_prize_pool", recordId: funded.id, fieldName: "recipient" }, { dataKey, wrappedKey: projectRecord.wrappedDataKey }),
    });

    const settlementPlan = await service.getSettlementTransactionPlan({
      projectId: project.value.id,
      seasonId: "season-1",
      actorWalletAddress: company,
    });
    expect(settlementPlan).toEqual({
      ok: true,
      value: expect.objectContaining({
        network: "SN_MAIN",
        operation: "strk20_transfer",
        tokenAddress: "0x123",
        tokenSymbol: "USDC",
        amountMinor: "50",
        recipient: "0x2",
        poolAddress: "0xabc",
        planDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    });
    if (!settlementPlan.ok) throw new Error(settlementPlan.code);

    phase = "settlement";
    const settlementHash = "0x222";
    await expect(service.confirmSettlement({
      projectId: project.value.id,
      seasonId: "season-1",
      actorWalletAddress: company,
      confirmation: confirmation(settlementPlan.value, settlementHash, now),
    })).resolves.toEqual({ ok: false, code: "TRANSACTION_NOT_CONFIRMED" });

    await expect(service.confirmSettlement({
      projectId: project.value.id,
      seasonId: "season-1",
      actorWalletAddress: company,
      confirmation: confirmation(settlementPlan.value, settlementHash, now),
    })).resolves.toEqual({ ok: true, value: expect.objectContaining({ status: "settled" }) });

    const publicReceipts = await service.listPublicSettlementReceipts(project.value.id);
    expect(publicReceipts).toEqual({
      ok: true,
      value: [expect.objectContaining({
        seasonId: "season-1",
        winnerAgentId: "CINDER",
        fundingReceiptDigest: expect.any(String),
        settlementReceiptDigest: expect.any(String),
      })],
    });
    if (!publicReceipts.ok) throw new Error(publicReceipts.code);
    expect(publicReceipts.value[0]).not.toHaveProperty("amountMinor");
    expect(publicReceipts.value[0]).not.toHaveProperty("tokenSymbol");
    expect(publicReceipts.value[0]).not.toHaveProperty("poolAddress");
    expect(publicReceipts.value[0]).not.toHaveProperty("fundingTransactionHash");
    expect(publicReceipts.value[0]).not.toHaveProperty("settlementTransactionHash");

    await repositories.projects.saveArenaSeason({
      id: "season-2",
      projectId: project.value.id,
      name: "Replay refusal season",
      rulesetVersion: "holdem.v1",
      startsAt: now,
      locksAt: now,
      endsAt: new Date(now.getTime() + 86_400_000),
      status: "locked",
      createdBy: "owner",
      createdAt: now,
      lockedAt: now,
    });
    await service.createPool({
      projectId: project.value.id,
      seasonId: "season-2",
      actorWalletAddress: company,
      tokenAddress: "0x123",
      tokenSymbol: "USDC",
      amountMinor: "50",
      idempotencyKey: "pool-create-2",
    });
    const replayPlan = await service.getFundingTransactionPlan({
      projectId: project.value.id,
      seasonId: "season-2",
      actorWalletAddress: company,
    });
    if (!replayPlan.ok) throw new Error(replayPlan.code);
    await expect(service.confirmFunding({
      projectId: project.value.id,
      seasonId: "season-2",
      actorWalletAddress: company,
      confirmation: confirmation(replayPlan.value, fundingHash, now),
    })).resolves.toEqual({ ok: false, code: "TRANSACTION_ALREADY_USED" });
  });
});
