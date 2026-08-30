import { describe, expect, it } from "vitest";

import { commitment } from "@/domain/canonical";
import { createTestKeyProvider } from "@/test/crypto/test-key-provider";
import { createMemoryRepositories } from "@/server/db/repositories";
import { CheckpointService } from "@/server/checkpoints/checkpoint-service";
import { ProjectService, type AgreementTerms } from "@/server/projects/project-service";
import { DecisionService } from "@/server/decisions/decision-service";
import { ReleaseService } from "./release-service";

const address = (value: string) => `0x${value.padStart(64, "0")}`;
const company = address("1");
const contributor = address("2");
const pepper = "release-test-wallet-pepper-0123456789012345";
const now = new Date("2026-08-28T10:00:00.000Z");
const terms: AgreementTerms = {
  title: "Private security review",
  acceptanceCriteria: [{ id: "report", description: "A signed report is delivered." }],
  milestoneMinor: "2500000",
  royaltyBps: 250,
  expiresAt: "2026-09-30T00:00:00.000Z",
};

async function fixture(amountMinor = "2500000") {
  const repositories = createMemoryRepositories();
  const keyProvider = createTestKeyProvider();
  let sequence = 0;
  const idFactory = () => `id-${++sequence}`;
  const projects = new ProjectService({ repositories: repositories.projects, keyProvider, walletHashPepper: pepper, now: () => now, idFactory });
  const created = await projects.createProject({ name: "Acme private work", walletAddress: company });
  if (!created.ok) throw new Error(created.code);
  await projects.inviteMember({ projectId: created.value.id, actorWalletAddress: company, walletAddress: contributor, role: "contributor" });
  const agreement = await projects.createAgreement({ projectId: created.value.id, actorWalletAddress: company, terms });
  if (!agreement.ok) throw new Error("AGREEMENT_FIXTURE_FAILED");
  const checkpoints = new CheckpointService({ repositories: repositories.projects, keyProvider, walletHashPepper: pepper, now: () => now, idFactory });
  const checkpoint = await checkpoints.submitCheckpoint({
    projectId: created.value.id,
    actorWalletAddress: contributor,
    checkpoint: { agreementVersion: 1, artifactBase64: "YQ==", mediaType: "application/zip", note: "Signed report" },
  });
  if (!checkpoint.ok) throw new Error(checkpoint.code);
  const verificationResult = { verdict: { checkpointId: checkpoint.value.id, scopeAccepted: true } };
  await repositories.projects.saveVerificationRun({ id: "verification-1", checkpointId: checkpoint.value.id, verifierFingerprint: "verifier", status: "completed", result: verificationResult, createdAt: now });
  const decisionService = new DecisionService({ repositories: repositories.projects, walletHashPepper: pepper, now: () => now, idFactory, verifySignature: async () => true });
  const decision = await decisionService.createDecision({
    actorWalletAddress: company,
    request: {
      schemaVersion: 1,
      chainId: "SN_MAIN",
      projectId: created.value.id,
      agreementVersion: 1,
      agreementDigest: agreement.value.termsDigest,
      checkpointId: checkpoint.value.id,
      checkpointDigest: checkpoint.value.payloadDigest,
      verificationDigest: commitment(verificationResult),
      decision: "accept",
      releaseAmountMinor: amountMinor,
      nonce: `0x${amountMinor}`,
      issuedAt: "2026-08-28T09:59:00.000Z",
      expiresAt: "2026-08-28T10:05:00.000Z",
      signature: ["0x1", "0x2"],
    },
  });
  if (!decision.ok) throw new Error(decision.code);
  return {
    repositories,
    projectId: created.value.id,
    decisionId: decision.value.id,
    revenueEventId: "revenue-1",
    service: new ReleaseService({ repositories: repositories.projects, keyProvider, walletHashPepper: pepper, now: () => now, idFactory }),
  };
}

describe("ReleaseService", () => {
  it("reserves one milestone release before a wallet prompt and is idempotent", async () => {
    const value = await fixture();
    const first = await value.service.prepareMilestoneRelease({ projectId: value.projectId, decisionId: value.decisionId, actorWalletAddress: company });
    expect(first).toMatchObject({ ok: true, value: { status: "prepared", amountMinor: "2500000" } });
    if (!first.ok) return;
    const repeated = await value.service.prepareMilestoneRelease({ projectId: value.projectId, decisionId: value.decisionId, actorWalletAddress: company });
    expect(repeated).toMatchObject({ ok: true, value: { id: first.value.id, status: "prepared" } });
    await expect(value.service.prepareMilestoneRelease({ projectId: value.projectId, decisionId: value.decisionId, actorWalletAddress: company, idempotencyKey: "different" })).resolves.toEqual({ ok: false, code: "RELEASE_ALREADY_EXISTS" });
    await expect(value.repositories.projects.getChainOperation(first.value.id)).resolves.toMatchObject({ status: "prepared" });
  });

  it("serializes concurrent reserve requests and refuses unresolved releases", async () => {
    const value = await fixture();
    const results = await Promise.all([
      value.service.prepareMilestoneRelease({ projectId: value.projectId, decisionId: value.decisionId, actorWalletAddress: company, idempotencyKey: "same-a" }),
      value.service.prepareMilestoneRelease({ projectId: value.projectId, decisionId: value.decisionId, actorWalletAddress: company, idempotencyKey: "same-b" }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
  });

  it("keeps wallet rejection prepared and records submitted state only after the second call", async () => {
    const value = await fixture();
    const prepared = await value.service.prepareMilestoneRelease({ projectId: value.projectId, decisionId: value.decisionId, actorWalletAddress: company });
    if (!prepared.ok) throw new Error("RELEASE_FIXTURE_FAILED");
    await expect(value.service.markWalletPrompted({ releaseId: prepared.value.id, actorWalletAddress: company })).resolves.toMatchObject({ ok: true, value: { status: "wallet_prompted" } });
    await expect(value.service.markWalletRejected({ releaseId: prepared.value.id, actorWalletAddress: company })).resolves.toMatchObject({ ok: true, value: { status: "prepared" } });
    await expect(value.service.markSubmitted({ releaseId: prepared.value.id, actorWalletAddress: company, transactionHash: "0x123" })).resolves.toEqual({ ok: false, code: "ILLEGAL_RELEASE_TRANSITION" });
    await value.service.markWalletPrompted({ releaseId: prepared.value.id, actorWalletAddress: company });
    await expect(value.service.markSubmitted({ releaseId: prepared.value.id, actorWalletAddress: company, transactionHash: "0x123" })).resolves.toMatchObject({ ok: true, value: { status: "submitted", transactionHash: "0x123" } });
  });

  it("encrypts revenue inputs and recomputes the royalty before reservation", async () => {
    const value = await fixture("250000");
    const revenue = await value.service.recordRevenueEvent({ projectId: value.projectId, actorWalletAddress: company, revenueEventId: value.revenueEventId, amountMinor: "10000000" });
    expect(revenue).toEqual({ ok: true, value: { id: value.revenueEventId, amountMinor: "10000000" } });
    const release = await value.service.prepareRoyaltyRelease({ projectId: value.projectId, decisionId: value.decisionId, revenueEventId: value.revenueEventId, actorWalletAddress: company });
    expect(release).toMatchObject({ ok: true, value: { kind: "royalty", amountMinor: "250000" } });
    await expect(value.repositories.projects.getRevenueEvent(value.revenueEventId)).resolves.toMatchObject({ encryptedAmount: { algorithm: "AES-256-GCM" } });
  });
});
