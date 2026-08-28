import { describe, expect, it } from "vitest";

import { createTestKeyProvider } from "@/test/crypto/test-key-provider";
import { createMemoryRepositories } from "@/server/db/repositories";
import { ProjectService, type AgreementTerms } from "@/server/projects/project-service";
import { CheckpointService } from "./checkpoint-service";

const address = (value: string) => `0x${value.padStart(64, "0")}`;
const company = address("1");
const contributor = address("2");
const reviewer = address("3");
const auditor = address("4");
const terms: AgreementTerms = {
  title: "Private security review",
  acceptanceCriteria: [{ id: "report", description: "A signed report is delivered." }],
  milestoneMinor: "2500000",
  royaltyBps: 250,
  expiresAt: "2026-09-30T00:00:00.000Z",
};

async function setup() {
  const repositories = createMemoryRepositories();
  const keyProvider = createTestKeyProvider();
  let nextId = 0;
  const projectService = new ProjectService({
    repositories: repositories.projects,
    keyProvider,
    walletHashPepper: "test-wallet-pepper-0123456789012345",
    now: () => new Date("2026-08-28T10:00:00.000Z"),
    idFactory: () => `id-${++nextId}`,
  });
  const checkpointService = new CheckpointService({
    repositories: repositories.projects,
    keyProvider,
    walletHashPepper: "test-wallet-pepper-0123456789012345",
    now: () => new Date("2026-08-28T10:00:00.000Z"),
    idFactory: () => `id-${++nextId}`,
  });
  const project = await projectService.createProject({ name: "Acme private work", walletAddress: company });
  if (!project.ok) throw new Error(project.code);
  await projectService.inviteMember({ projectId: project.value.id, actorWalletAddress: company, walletAddress: contributor, role: "contributor" });
  await projectService.inviteMember({ projectId: project.value.id, actorWalletAddress: company, walletAddress: reviewer, role: "reviewer" });
  await projectService.inviteMember({ projectId: project.value.id, actorWalletAddress: company, walletAddress: auditor, role: "auditor" });
  await projectService.createAgreement({ projectId: project.value.id, actorWalletAddress: company, terms });
  return { checkpointService, projectId: project.value.id };
}

function artifactOfByteLength(length: number): string {
  return Buffer.alloc(length, 7).toString("base64");
}

describe("CheckpointService", () => {
  it("binds a submitted checkpoint to its agreement version and creates a new sequence for corrections", async () => {
    const { checkpointService, projectId } = await setup();
    const first = await checkpointService.submitCheckpoint({
      projectId,
      actorWalletAddress: contributor,
      checkpoint: { agreementVersion: 1, artifactBase64: artifactOfByteLength(8), mediaType: "application/zip", note: "first" },
    });
    const second = await checkpointService.submitCheckpoint({
      projectId,
      actorWalletAddress: contributor,
      checkpoint: { agreementVersion: 1, artifactBase64: artifactOfByteLength(9), mediaType: "application/zip", note: "corrected" },
    });
    expect(first).toMatchObject({ ok: true, value: { sequence: 1, agreementVersion: 1 } });
    expect(second).toMatchObject({ ok: true, value: { sequence: 2, agreementVersion: 1 } });
  });

  it("allows only an assigned reviewer to read evidence", async () => {
    const { checkpointService, projectId } = await setup();
    const submitted = await checkpointService.submitCheckpoint({
      projectId,
      actorWalletAddress: contributor,
      checkpoint: {
        agreementVersion: 1,
        artifactBase64: artifactOfByteLength(8),
        mediaType: "application/zip",
        note: "review this",
        reviewerWalletAddress: reviewer,
      },
    });
    if (!submitted.ok) throw new Error(submitted.code);
    await expect(checkpointService.readCheckpoint({ checkpointId: submitted.value.id, walletAddress: reviewer })).resolves.toMatchObject({
      ok: true,
      value: { artifactBase64: artifactOfByteLength(8), note: "review this" },
    });
    const auditorView = await checkpointService.readCheckpoint({ checkpointId: submitted.value.id, walletAddress: auditor });
    expect(auditorView).toMatchObject({ ok: true, value: { agreementVersion: 1 } });
    if (auditorView.ok) {
      expect(auditorView.value).not.toHaveProperty("artifactBase64");
      expect(auditorView.value).not.toHaveProperty("note");
    }
    await expect(checkpointService.readCheckpoint({ checkpointId: submitted.value.id, walletAddress: address("5") })).resolves.toEqual({
      ok: false,
      code: "PROJECT_ACCESS_REQUIRED",
    });
  });

  it("refuses a URL, accepts exactly 1,048,576 bytes, and refuses one byte more", async () => {
    const { checkpointService, projectId } = await setup();
    const base = { agreementVersion: 1 as const, mediaType: "application/zip" as const, note: "size" };
    await expect(checkpointService.submitCheckpoint({
      projectId,
      actorWalletAddress: contributor,
      checkpoint: { ...base, artifactBase64: Buffer.from("https://example.com/report").toString("base64"), sourceUrl: "https://example.com/report" },
    })).resolves.toEqual({ ok: false, code: "URL_EVIDENCE_REFUSED" });
    await expect(checkpointService.submitCheckpoint({
      projectId,
      actorWalletAddress: contributor,
      checkpoint: { ...base, artifactBase64: artifactOfByteLength(1_048_576) },
    })).resolves.toMatchObject({ ok: true });
    await expect(checkpointService.submitCheckpoint({
      projectId,
      actorWalletAddress: contributor,
      checkpoint: { ...base, artifactBase64: artifactOfByteLength(1_048_577) },
    })).resolves.toEqual({ ok: false, code: "ARTIFACT_TOO_LARGE" });
  });
});
