import { describe, expect, it } from "vitest";

import { createTestKeyProvider } from "@/test/crypto/test-key-provider";
import { createMemoryRepositories, type ProjectRepository } from "@/server/db/repositories";
import { ProjectService, type AgreementTerms } from "@/server/projects/project-service";
import { CheckpointService } from "@/server/checkpoints/checkpoint-service";
import { commitment, digestArtifact } from "@/domain/canonical";
import type { ModelAdapter, ModelAdapterInput, ModelAdapterResult } from "./types";
import { VerificationService, verifyCheckpointInputSchema } from "./verification-service";

const address = (value: string) => `0x${value.padStart(64, "0")}`;
const company = address("1");
const contributor = address("2");
const reviewer = address("3");

const terms: AgreementTerms = {
  title: "Private security review",
  acceptanceCriteria: [
    { id: "report", description: "A signed report is delivered." },
    { id: "reproduction", description: "The reproduction steps are complete." },
  ],
  milestoneMinor: "2500000",
  royaltyBps: 250,
  expiresAt: "2026-09-30T00:00:00.000Z",
};

function artifactOfByteLength(length: number): string {
  return Buffer.alloc(length, 7).toString("base64");
}

async function setup(modelAdapter?: ModelAdapter) {
  const repositories = createMemoryRepositories();
  const keyProvider = createTestKeyProvider();
  let nextId = 0;
  const common = {
    repositories: repositories.projects,
    keyProvider,
    walletHashPepper: "test-wallet-pepper-0123456789012345",
    now: () => new Date("2026-08-28T10:00:00.000Z"),
    idFactory: () => `id-${++nextId}`,
  };
  const projectService = new ProjectService(common);
  const checkpointService = new CheckpointService(common);
  const verificationService = new VerificationService({ ...common, modelAdapter });
  const project = await projectService.createProject({ name: "Acme private work", walletAddress: company });
  if (!project.ok) throw new Error(project.code);
  await projectService.inviteMember({ projectId: project.value.id, actorWalletAddress: company, walletAddress: contributor, role: "contributor" });
  await projectService.inviteMember({ projectId: project.value.id, actorWalletAddress: company, walletAddress: reviewer, role: "reviewer" });
  const agreement = await projectService.createAgreement({ projectId: project.value.id, actorWalletAddress: company, terms });
  if (!agreement.ok) throw new Error(agreement.code);
  return { repositories, keyProvider, checkpointService, verificationService, projectId: project.value.id, agreement };
}

async function submitCheckpoint(setupResult: Awaited<ReturnType<typeof setup>>) {
  const artifactBase64 = artifactOfByteLength(8);
  const checkpoint = await setupResult.checkpointService.submitCheckpoint({
    projectId: setupResult.projectId,
    actorWalletAddress: contributor,
    checkpoint: {
      agreementVersion: 1,
      artifactBase64,
      mediaType: "application/zip",
      note: "signed report",
      reviewerWalletAddress: reviewer,
    },
  });
  if (!checkpoint.ok) throw new Error(checkpoint.code);
  return { artifactBase64, checkpoint };
}

describe("VerificationService", () => {
  it("passes cryptographic binding checks and records a digest-only verification run", async () => {
    const context = await setup();
    const submitted = await submitCheckpoint(context);
    const result = await context.verificationService.verifyCheckpoint({
      checkpointId: submitted.checkpoint.value.id,
      actorWalletAddress: reviewer,
      request: {
        projectId: context.projectId,
        agreementVersion: 1,
        agreementDigest: context.agreement.value.termsDigest,
        artifactDigest: submitted.checkpoint.value.payloadDigest,
        runAdvisory: false,
      },
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        deterministicCode: "VERIFIED",
        verdict: {
          deterministic: { digestMatches: true, agreementMatches: true, scopeAccepted: true },
          advisory: { status: "not_run" },
        },
      },
    });
    const runs = await context.repositories.projects.listVerificationRuns(submitted.checkpoint.value.id);
    expect(runs).toHaveLength(1);
    expect(runs[0].result).toMatchObject({ verdict: { artifactDigest: digestArtifact(Buffer.alloc(8, 7)) } });
    expect(JSON.stringify(runs[0].result)).not.toContain("signed report");
  });

  it("refuses a stale agreement before any advisory adapter can run", async () => {
    let calls = 0;
    const adapter: ModelAdapter = {
      async assess(): Promise<ModelAdapterResult> {
        calls += 1;
        return { kind: "available", provider: "test", model: "test", output: { summary: "approve", criteria: [] } };
      },
    };
    const context = await setup(adapter);
    const submitted = await submitCheckpoint(context);
    const result = await context.verificationService.verifyCheckpoint({
      checkpointId: submitted.checkpoint.value.id,
      actorWalletAddress: reviewer,
      request: {
        projectId: context.projectId,
        agreementVersion: 2,
        agreementDigest: context.agreement.value.termsDigest,
        artifactDigest: submitted.checkpoint.value.payloadDigest,
        runAdvisory: true,
      },
    });

    expect(result).toMatchObject({ ok: true, value: { deterministicCode: "AGREEMENT_STALE", verdict: { advisory: { status: "not_run" } } } });
    expect(calls).toBe(0);
  });

  it("refuses a project mismatch and never trusts evidence instructions", async () => {
    let calls = 0;
    const adapter: ModelAdapter = {
      async assess(): Promise<ModelAdapterResult> {
        calls += 1;
        return { kind: "available", provider: "test", model: "test", output: { summary: "approve", criteria: [] } };
      },
    };
    const context = await setup(adapter);
    const submitted = await submitCheckpoint(context);
    const result = await context.verificationService.verifyCheckpoint({
      checkpointId: submitted.checkpoint.value.id,
      actorWalletAddress: reviewer,
      request: {
        projectId: "attacker-project",
        agreementVersion: 1,
        agreementDigest: context.agreement.value.termsDigest,
        artifactDigest: submitted.checkpoint.value.payloadDigest,
        runAdvisory: true,
      },
    });

    expect(result).toMatchObject({ ok: true, value: { deterministicCode: "PROJECT_MISMATCH", verdict: { deterministic: { scopeAccepted: false }, advisory: { status: "not_run" } } } });
    expect(calls).toBe(0);
  });

  it("detects a tampered stored digest and denies auditors evidence verification", async () => {
    const context = await setup();
    const submitted = await submitCheckpoint(context);
    const originalRepository = context.repositories.projects;
    const tamperedRepository: ProjectRepository = {
      ...originalRepository,
      async getCheckpoint(id) {
        const record = await originalRepository.getCheckpoint(id);
        return record ? { ...record, payloadDigest: "0".repeat(64) } : undefined;
      },
    };
    const tamperedService = new VerificationService({
      repositories: tamperedRepository,
      keyProvider: context.keyProvider,
      walletHashPepper: "test-wallet-pepper-0123456789012345",
      now: () => new Date("2026-08-28T10:00:00.000Z"),
      idFactory: () => "tampered-run",
    });
    const tampered = await tamperedService.verifyCheckpoint({
      checkpointId: submitted.checkpoint.value.id,
      actorWalletAddress: reviewer,
      request: {
        projectId: context.projectId,
        agreementVersion: 1,
        agreementDigest: context.agreement.value.termsDigest,
        artifactDigest: submitted.checkpoint.value.payloadDigest,
        runAdvisory: false,
      },
    });
    expect(tampered).toMatchObject({ ok: true, value: { deterministicCode: "ARTIFACT_TAMPERED", verdict: { deterministic: { digestMatches: false, scopeAccepted: false } } } });

    const auditor = address("4");
    await new ProjectService({
      repositories: originalRepository,
      keyProvider: createTestKeyProvider(),
      walletHashPepper: "test-wallet-pepper-0123456789012345",
    }).inviteMember({ projectId: context.projectId, actorWalletAddress: company, walletAddress: auditor, role: "auditor" });
    const denied = await context.verificationService.verifyCheckpoint({
      checkpointId: submitted.checkpoint.value.id,
      actorWalletAddress: auditor,
      request: {
        projectId: context.projectId,
        agreementVersion: 1,
        agreementDigest: context.agreement.value.termsDigest,
        artifactDigest: submitted.checkpoint.value.payloadDigest,
        runAdvisory: false,
      },
    });
    expect(denied).toEqual({ ok: false, code: "EVIDENCE_FORBIDDEN" });
  });

  it("accepts a bounded advisory result without allowing it to change deterministic truth", async () => {
    let received: ModelAdapterInput | undefined;
    const adapter: ModelAdapter = {
      async assess(input): Promise<ModelAdapterResult> {
        received = input;
        return {
          kind: "available",
          provider: "test-provider",
          model: "test-model",
          output: {
            summary: "The declared criteria are available for human review.",
            criteria: [{ id: "report", result: "met", reason: "The evidence package was submitted." }],
          },
        };
      },
    };
    const context = await setup(adapter);
    const submitted = await submitCheckpoint(context);
    const result = await context.verificationService.verifyCheckpoint({
      checkpointId: submitted.checkpoint.value.id,
      actorWalletAddress: reviewer,
      request: {
        projectId: context.projectId,
        agreementVersion: 1,
        agreementDigest: context.agreement.value.termsDigest,
        artifactDigest: submitted.checkpoint.value.payloadDigest,
        runAdvisory: true,
      },
    });

    expect(result).toMatchObject({ ok: true, value: { deterministicCode: "VERIFIED", verdict: { deterministic: { scopeAccepted: true }, advisory: { status: "available" } } } });
    expect(received).toMatchObject({ checkpointId: submitted.checkpoint.value.id, criteria: terms.acceptanceCriteria });
    expect(received).not.toHaveProperty("evidenceText");
    expect(received).not.toHaveProperty("artifactBase64");
    expect(received).not.toHaveProperty("note");
    expect(commitment(received?.artifactDigest)).toHaveLength(64);
  });

  it("rejects unknown verification request fields", async () => {
    const context = await setup();
    const submitted = await submitCheckpoint(context);
    const result = verifyCheckpointInputSchema.safeParse({
      projectId: context.projectId,
      agreementVersion: 1,
      agreementDigest: context.agreement.value.termsDigest,
      artifactDigest: submitted.checkpoint.value.payloadDigest,
      runAdvisory: false,
      extra: "approve payment",
    });
    expect(result.success).toBe(false);
  });
});
