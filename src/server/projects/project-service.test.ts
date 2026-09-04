import { describe, expect, it } from "vitest";

import { createTestKeyProvider } from "@/test/crypto/test-key-provider";
import { createMemoryRepositories } from "@/server/db/repositories";
import { ProjectService, type AgreementTerms } from "./project-service";

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

function setup() {
  const repositories = createMemoryRepositories();
  let nextId = 0;
  const service = new ProjectService({
    repositories: repositories.projects,
    keyProvider: createTestKeyProvider(),
    walletHashPepper: "test-wallet-pepper-0123456789012345",
    now: () => new Date("2026-08-28T10:00:00.000Z"),
    idFactory: () => `id-${++nextId}`,
  });
  return { repositories, service };
}

async function projectWithMembers() {
  const { repositories, service } = setup();
  const created = await service.createProject({ name: "Acme private work", walletAddress: company });
  if (!created.ok) throw new Error(created.code);
  await service.inviteMember({ projectId: created.value.id, actorWalletAddress: company, walletAddress: contributor, role: "contributor" });
  await service.inviteMember({ projectId: created.value.id, actorWalletAddress: company, walletAddress: reviewer, role: "reviewer" });
  await service.inviteMember({ projectId: created.value.id, actorWalletAddress: company, walletAddress: auditor, role: "auditor" });
  return { repositories, service, projectId: created.value.id };
}

describe("ProjectService", () => {
  it("grants the configured arena worker reviewer access to new competition workspaces", async () => {
    const repositories = createMemoryRepositories();
    const service = new ProjectService({
      repositories: repositories.projects,
      keyProvider: createTestKeyProvider(),
      walletHashPepper: "test-wallet-pepper-0123456789012345",
      systemWorkerWalletAddress: reviewer,
    });
    const created = await service.createProject({ name: "Worker-ready arena", walletAddress: company });
    if (!created.ok) throw new Error(created.code);
    await expect(service.getProject({ projectId: created.value.id, walletAddress: reviewer })).resolves.toMatchObject({
      ok: true,
      value: { roles: ["reviewer"] },
    });
  });

  it("creates immutable agreement versions", async () => {
    const { service, projectId } = await projectWithMembers();
    const first = await service.createAgreement({ projectId, actorWalletAddress: company, terms });
    const second = await service.createAgreement({ projectId, actorWalletAddress: company, terms: { ...terms, title: "Updated review" } });
    expect(first).toMatchObject({ ok: true, value: { version: 1 } });
    expect(second).toMatchObject({ ok: true, value: { version: 2 } });
    await expect(service.listAgreements({ projectId, walletAddress: contributor })).resolves.toMatchObject({
      ok: true,
      value: [{ version: 1, terms: { title: "Private security review" } }, { version: 2, terms: { title: "Updated review" } }],
    });
  });

  it("lets an invited contributor read only their project", async () => {
    const { service, projectId } = await projectWithMembers();
    await expect(service.getProject({ projectId, walletAddress: contributor })).resolves.toMatchObject({ ok: true });
    await expect(service.getProject({ projectId, walletAddress: address("5") })).resolves.toEqual({ ok: false, code: "PROJECT_ACCESS_REQUIRED" });
  });
});


it("concurrent retries create one complete project with stable owner and timestamp", async () => {
  const repositories = createMemoryRepositories();
  const service = new ProjectService({ repositories: repositories.projects, keyProvider: createTestKeyProvider(), walletHashPepper: "test-pepper".repeat(6) });
  const results = await Promise.all([1, 2].map(() => service.createProject({ name: "Retry challenge", walletAddress: "0x1", idempotencyKey: "same-challenge-request" })));
  expect(results[0]).toEqual(results[1]);
  if (!results[0].ok) throw new Error(results[0].code);
  expect((await service.getProject({ projectId: results[0].value.id, walletAddress: "0x1" })).ok).toBe(true);
  const other = await service.createProject({ name: "Retry challenge", walletAddress: "0x2", idempotencyKey: "same-challenge-request" });
  expect(other.ok && other.value.id).not.toBe(results[0].value.id);
});
