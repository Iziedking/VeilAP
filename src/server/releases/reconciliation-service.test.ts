import { describe, expect, it } from "vitest";

import { createMemoryRepositories, type ChainOperationRecord, type ReleaseRecord } from "@/server/db/repositories";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";
import { ReconciliationService } from "./reconciliation-service";

const address = (value: string) => `0x${value.padStart(64, "0")}`;
const company = address("1");
const pepper = "reconciliation-test-wallet-pepper-0123456789012345";
const poolAddress = "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";
const createdAt = new Date("2026-08-28T10:00:00.000Z");

async function fixture(status: ReleaseRecord["status"] = "submitted") {
  const repositories = createMemoryRepositories();
  await repositories.projects.saveProject({
    id: "project-1",
    name: "Private work",
    ownerFingerprint: fingerprintWallet(company, pepper),
    wrappedDataKey: "unused",
    createdAt,
  });
  const release: ReleaseRecord = {
    id: "release-1",
    kind: "milestone",
    sourceId: "checkpoint-1",
    projectId: "project-1",
    decisionId: "decision-1",
    amountMinor: "2500000",
    idempotencyKey: "release:milestone:checkpoint-1",
    status,
    createdAt,
  };
  const operation: ChainOperationRecord = {
    id: "operation-1",
    releaseId: release.id,
    operationType: "private_transfer",
    status,
    transactionHash: "0xabc123",
    createdAt,
    updatedAt: createdAt,
  };
  await repositories.projects.saveRelease(release);
  await repositories.projects.saveChainOperation(operation);
  return { repositories, service: (provider: { getTransactionReceipt: () => Promise<unknown>; getTransactionTrace: () => Promise<unknown> }) => new ReconciliationService({ repositories: repositories.projects, receiptProvider: provider, walletHashPepper: pepper, poolAddress, now: () => createdAt, sleep: async () => undefined }) };
}

describe("ReconciliationService", () => {
  it("confirms only a successful receipt whose trace touches the pool", async () => {
    let receiptCalls = 0;
    const value = await fixture();
    const service = value.service({
      getTransactionReceipt: async () => { receiptCalls += 1; return { execution_status: "SUCCEEDED" }; },
      getTransactionTrace: async () => ({ calls: [{ contract_address: poolAddress.toUpperCase() }] }),
    });
    const confirmed = await service.reconcile({ releaseId: "release-1", actorWalletAddress: company });
    expect(confirmed).toMatchObject({ ok: true, value: { status: "confirmed", transactionHash: "0xabc123" } });
    const repeated = await service.reconcile({ releaseId: "release-1", actorWalletAddress: company });
    expect(repeated).toEqual(confirmed);
    expect(receiptCalls).toBe(1);
  });

  it("marks missing pool trace unknown and never treats a revert as paid", async () => {
    const missingTrace = await fixture();
    const unknown = await missingTrace.service({
      getTransactionReceipt: async () => ({ execution_status: "SUCCEEDED" }),
      getTransactionTrace: async () => ({ calls: [{ contract_address: "0x123" }] }),
    }).reconcile({ releaseId: "release-1", actorWalletAddress: company });
    expect(unknown).toMatchObject({ ok: true, value: { status: "unknown", reason: "POOL_TRACE_MISSING" } });

    const reverted = await fixture();
    await expect(reverted.service({
      getTransactionReceipt: async () => ({ execution_status: "REVERTED" }),
      getTransactionTrace: async () => ({}),
    }).reconcile({ releaseId: "release-1", actorWalletAddress: company })).resolves.toMatchObject({ ok: true, value: { status: "reverted", reason: "TRANSACTION_REVERTED" } });
  });

  it("keeps submitted state across a new service instance and reports timeout as unknown", async () => {
    const value = await fixture();
    const result = await value.service({
      getTransactionReceipt: async () => ({}),
      getTransactionTrace: async () => ({}),
    }).reconcile({ releaseId: "release-1", actorWalletAddress: company });
    expect(result).toMatchObject({ ok: true, value: { status: "unknown", reason: "CONFIRMATION_TIMEOUT" } });
    await expect(value.repositories.projects.getRelease("release-1")).resolves.toMatchObject({ status: "unknown" });
    await expect(value.service({ getTransactionReceipt: async () => ({}), getTransactionTrace: async () => ({}) }).reconcile({ releaseId: "release-1", actorWalletAddress: address("9") })).resolves.toEqual({ ok: false, code: "WALLET_FORBIDDEN" });
  });
});
