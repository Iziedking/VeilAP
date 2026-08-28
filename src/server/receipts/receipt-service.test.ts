import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createProjectKeyMaterial } from "@/server/crypto/key-provider";
import { createPreviewKeyProvider } from "@/server/crypto/preview-key-provider";
import { createMemoryRepositories } from "@/server/db/repositories";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";
import { ReceiptService } from "./receipt-service";
import { createReceiptSigner, verifySignedReceipt } from "./signing";

const pepper = "receipt-test-wallet-pepper-012345678901234567890123456789";
const companyWallet = `0x${"0".repeat(63)}1`;
const contributorWallet = `0x${"0".repeat(63)}2`;
const auditorWallet = `0x${"0".repeat(63)}3`;
const projectId = "project-private-security";
const projectName = "Confidential security engagement";
const agreementDigest = "a".repeat(64);
const checkpointDigest = "b".repeat(64);
const verificationDigest = "c".repeat(64);
const fixedNow = new Date("2026-08-28T10:00:00.000Z");

function createSigner() {
  const pair = generateKeyPairSync("ed25519");
  const privateKeyBase64 = pair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  const publicKeyBase64 = pair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
  return {
    signer: createReceiptSigner({ privateKeyBase64, publicKeyBase64 }),
    publicKeyBase64,
  };
}

async function createReceiptFixture() {
  const repositories = createMemoryRepositories().projects;
  const keyProvider = createPreviewKeyProvider();
  const keyMaterial = await createProjectKeyMaterial(keyProvider, projectId);
  await repositories.saveProject({
    id: projectId,
    name: projectName,
    ownerFingerprint: fingerprintWallet(companyWallet, pepper),
    wrappedDataKey: keyMaterial.wrappedKey,
    createdAt: fixedNow,
  });
  await repositories.saveMember({
    projectId,
    walletFingerprint: fingerprintWallet(contributorWallet, pepper),
    role: "contributor",
    createdAt: fixedNow,
  });
  await repositories.saveMember({
    projectId,
    walletFingerprint: fingerprintWallet(auditorWallet, pepper),
    role: "auditor",
    createdAt: fixedNow,
  });
  await repositories.saveDecision({
    id: "decision-1",
    checkpointId: "checkpoint-1",
    schemaVersion: 1,
    projectId,
    agreementVersion: 1,
    agreementDigest,
    checkpointDigest,
    verificationDigest,
    decision: "accept",
    releaseAmountMinor: "4750000",
    nonce: "nonce-1",
    issuedAt: fixedNow,
    expiresAt: new Date("2026-08-29T10:00:00.000Z"),
    signature: ["1", "2"],
    decidedBy: fingerprintWallet(companyWallet, pepper),
    createdAt: fixedNow,
  });
  await repositories.saveRelease({
    id: "release-1",
    kind: "milestone",
    sourceId: "checkpoint-1",
    projectId,
    decisionId: "decision-1",
    amountMinor: "4750000",
    idempotencyKey: "release:milestone:checkpoint-1",
    status: "confirmed",
    createdAt: fixedNow,
  });
  await repositories.saveChainOperation({
    id: "operation-1",
    releaseId: "release-1",
    operationType: "private_transfer",
    status: "confirmed",
    transactionHash: `0x${"4".repeat(64)}`,
    receiptDigest: "d".repeat(64),
    updatedAt: fixedNow,
    createdAt: fixedNow,
  });
  const { signer, publicKeyBase64 } = createSigner();
  const service = new ReceiptService({
    repositories,
    keyProvider,
    signer,
    walletHashPepper: pepper,
    now: () => fixedNow,
    receiptTtlMs: 60_000,
  });
  return { repositories, service, publicKeyBase64 };
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; code: string }): T {
  if (!result.ok) throw new Error(result.code);
  return result.value;
}

describe("ReceiptService", () => {
  it("issues independent company, contributor, and auditor disclosures", async () => {
    const { service } = await createReceiptFixture();
    const company = unwrap(await service.issue({ projectId, releaseId: "release-1", audience: "company", actorWalletAddress: companyWallet }));
    const contributor = unwrap(await service.issue({ projectId, releaseId: "release-1", audience: "contributor", actorWalletAddress: contributorWallet }));
    const auditor = unwrap(await service.issue({ projectId, releaseId: "release-1", audience: "auditor", actorWalletAddress: auditorWallet }));

    expect(company.receipt.payload).toHaveProperty("projectId", projectId);
    expect(company.receipt.payload).toHaveProperty("amountMinor", "4750000");
    expect(contributor.receipt.payload).toHaveProperty("releaseAmountMinor", "4750000");
    expect(contributor.receipt.payload).not.toHaveProperty("projectId");

    const auditorSerialized = JSON.stringify(auditor.receipt);
    expect(auditorSerialized).not.toContain(projectName);
    expect(auditorSerialized).not.toContain("4750000");
    expect(auditorSerialized).not.toContain(companyWallet);
    expect(auditor.receipt.payload).not.toHaveProperty("projectId");
    expect(auditor.receipt.payload).not.toHaveProperty("amountMinor");
    expect(auditor.receipt.payload).not.toHaveProperty("releaseAmountMinor");
    expect(auditor.receipt.payload).not.toHaveProperty("recipient");
    expect(auditor.receipt.payload).toHaveProperty("calculationDigest", expect.any(String));
  });

  it("verifies signatures, rejects tampering, and rejects expired receipts", async () => {
    const { service, publicKeyBase64 } = await createReceiptFixture();
    const issued = unwrap(await service.issue({ projectId, releaseId: "release-1", audience: "auditor", actorWalletAddress: auditorWallet }));
    expect(verifySignedReceipt(issued.receipt, publicKeyBase64, fixedNow)).toBe(true);

    const tampered = {
      ...issued.receipt,
      payload: { ...issued.receipt.payload, decision: "reject" as const },
    };
    expect(verifySignedReceipt(tampered, publicKeyBase64, fixedNow)).toBe(false);
    expect(verifySignedReceipt(issued.receipt, publicKeyBase64, new Date("2026-08-28T10:01:00.001Z"))).toBe(false);
  });

  it("persists encrypted receipts and replays the same signed receipt", async () => {
    const { service, repositories } = await createReceiptFixture();
    const first = unwrap(await service.issue({ projectId, releaseId: "release-1", audience: "company", actorWalletAddress: companyWallet }));
    const second = unwrap(await service.issue({ projectId, releaseId: "release-1", audience: "company", actorWalletAddress: companyWallet }));
    const stored = await repositories.getSelectiveReceipt(first.receiptId);

    expect(second).toEqual(first);
    expect(stored).toBeDefined();
    expect(stored?.encryptedPayload).toHaveProperty("algorithm", "AES-256-GCM");
    expect(JSON.stringify(stored?.encryptedPayload)).not.toContain(projectName);
    expect(JSON.stringify(stored?.encryptedPayload)).not.toContain("4750000");
  });

  it("refuses an audience without the matching project role", async () => {
    const { service } = await createReceiptFixture();
    const result = await service.issue({ projectId, releaseId: "release-1", audience: "auditor", actorWalletAddress: contributorWallet });
    expect(result).toEqual({ ok: false, code: "ROLE_FORBIDDEN" });
  });
});
