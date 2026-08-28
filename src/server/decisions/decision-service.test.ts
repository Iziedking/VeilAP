import { describe, expect, it } from "vitest";

import { commitment } from "@/domain/canonical";
import { createTestKeyProvider } from "@/test/crypto/test-key-provider";
import { createMemoryRepositories } from "@/server/db/repositories";
import { CheckpointService } from "@/server/checkpoints/checkpoint-service";
import { DecisionService, type SignedDecisionInput } from "./decision-service";
import { ProjectService, type AgreementTerms } from "@/server/projects/project-service";

const address = (value: string) => `0x${value.padStart(64, "0")}`;
const company = address("1");
const contributor = address("2");
const pepper = "decision-test-wallet-pepper-0123456789012345";
const now = new Date("2026-08-28T10:00:00.000Z");
const terms: AgreementTerms = {
  title: "Private security review",
  acceptanceCriteria: [{ id: "report", description: "A signed report is delivered." }],
  milestoneMinor: "2500000",
  royaltyBps: 250,
  expiresAt: "2026-09-30T00:00:00.000Z",
};

async function fixture() {
  const repositories = createMemoryRepositories();
  const keyProvider = createTestKeyProvider();
  let sequence = 0;
  const idFactory = () => `id-${++sequence}`;
  const projects = new ProjectService({ repositories: repositories.projects, keyProvider, walletHashPepper: pepper, now: () => now, idFactory });
  const created = await projects.createProject({ name: "Acme private work", walletAddress: company });
  if (!created.ok) throw new Error(created.code);
  await projects.inviteMember({ projectId: created.value.id, actorWalletAddress: company, walletAddress: contributor, role: "contributor" });
  const agreement = await projects.createAgreement({ projectId: created.value.id, actorWalletAddress: company, terms });
  if (!agreement.ok || !agreement.value.terms) throw new Error("AGREEMENT_FIXTURE_FAILED");
  const checkpoints = new CheckpointService({ repositories: repositories.projects, keyProvider, walletHashPepper: pepper, now: () => now, idFactory });
  const checkpoint = await checkpoints.submitCheckpoint({
    projectId: created.value.id,
    actorWalletAddress: contributor,
    checkpoint: {
      agreementVersion: 1,
      artifactBase64: "YQ==",
      mediaType: "application/zip",
      note: "Signed report",
    },
  });
  if (!checkpoint.ok) throw new Error(checkpoint.code);
  const verificationResult = { verdict: { checkpointId: checkpoint.value.id, scopeAccepted: true } };
  await repositories.projects.saveVerificationRun({
    id: "verification-1",
    checkpointId: checkpoint.value.id,
    verifierFingerprint: "verifier",
    status: "completed",
    result: verificationResult,
    createdAt: now,
  });
  const decision = new DecisionService({
    repositories: repositories.projects,
    walletHashPepper: pepper,
    now: () => now,
    idFactory,
    verifySignature: async () => true,
  });
  return { repositories, projectId: created.value.id, agreement: agreement.value, checkpoint: checkpoint.value, verificationDigest: commitment(verificationResult), decision };
}

function request(fixtureValue: Awaited<ReturnType<typeof fixture>>, overrides: Partial<SignedDecisionInput> = {}): SignedDecisionInput {
  return {
    schemaVersion: 1,
    chainId: "SN_MAIN",
    projectId: fixtureValue.projectId,
    agreementVersion: fixtureValue.agreement.version,
    agreementDigest: fixtureValue.agreement.termsDigest,
    checkpointId: fixtureValue.checkpoint.id,
    checkpointDigest: fixtureValue.checkpoint.payloadDigest,
    verificationDigest: fixtureValue.verificationDigest,
    decision: "accept",
    releaseAmountMinor: "2500000",
    nonce: "0xabc123",
    issuedAt: "2026-08-28T09:59:00.000Z",
    expiresAt: "2026-08-28T10:05:00.000Z",
    signature: ["0x1", "0x2"],
    ...overrides,
  };
}

describe("DecisionService", () => {
  it("accepts a signed decision bound to the exact checkpoint and report", async () => {
    const value = await fixture();
    await expect(value.decision.createDecision({ actorWalletAddress: company, request: request(value) })).resolves.toMatchObject({
      ok: true,
      value: { decision: "accept", checkpointId: value.checkpoint.id },
    });
  });

  it("refuses stale agreement, checkpoint, report, expired, and wrong wallet decisions", async () => {
    const staleAgreement = await fixture();
    await expect(staleAgreement.decision.createDecision({ actorWalletAddress: company, request: request(staleAgreement, { agreementDigest: "0".repeat(64) }) })).resolves.toEqual({ ok: false, code: "AGREEMENT_STALE" });

    const staleCheckpoint = await fixture();
    await expect(staleCheckpoint.decision.createDecision({ actorWalletAddress: company, request: request(staleCheckpoint, { checkpointDigest: "0".repeat(64) }) })).resolves.toEqual({ ok: false, code: "CHECKPOINT_STALE" });

    const staleReport = await fixture();
    await expect(staleReport.decision.createDecision({ actorWalletAddress: company, request: request(staleReport, { verificationDigest: "0".repeat(64) }) })).resolves.toEqual({ ok: false, code: "VERIFICATION_STALE" });

    const expired = await fixture();
    await expect(expired.decision.createDecision({ actorWalletAddress: company, request: request(expired, { expiresAt: "2026-08-28T09:59:00.000Z" }) })).resolves.toEqual({ ok: false, code: "DECISION_EXPIRED" });

    const wrongWallet = await fixture();
    await expect(wrongWallet.decision.createDecision({ actorWalletAddress: address("9"), request: request(wrongWallet) })).resolves.toEqual({ ok: false, code: "WALLET_FORBIDDEN" });
  });

  it("refuses a replayed nonce and maps verifier failure explicitly", async () => {
    const value = await fixture();
    const first = await value.decision.createDecision({ actorWalletAddress: company, request: request(value) });
    expect(first.ok).toBe(true);
    await expect(value.decision.createDecision({ actorWalletAddress: company, request: request(value) })).resolves.toEqual({ ok: false, code: "DECISION_NONCE_REPLAYED" });

    const unavailable = await fixture();
    const service = new DecisionService({
      repositories: unavailable.repositories.projects,
      walletHashPepper: pepper,
      now: () => now,
      verifySignature: async () => { throw new Error("RPC_DOWN"); },
    });
    await expect(service.createDecision({ actorWalletAddress: company, request: request(unavailable) })).resolves.toEqual({ ok: false, code: "SIGNATURE_UNAVAILABLE" });
  });

  it("requires an amount for acceptance and rejects invalid signatures", async () => {
    const missingAmount = await fixture();
    await expect(missingAmount.decision.createDecision({ actorWalletAddress: company, request: request(missingAmount, { releaseAmountMinor: undefined }) })).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });

    const value = await fixture();
    const service = new DecisionService({ repositories: value.repositories.projects, walletHashPepper: pepper, now: () => now, verifySignature: async () => false });
    await expect(service.createDecision({ actorWalletAddress: company, request: request(value) })).resolves.toEqual({ ok: false, code: "SIGNATURE_INVALID" });
  });
});
