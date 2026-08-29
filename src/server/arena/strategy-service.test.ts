import { describe, expect, it } from "vitest";

import { createPreviewKeyProvider } from "@/server/crypto/preview-key-provider";
import { createMemoryRepositories } from "@/server/db/repositories";
import { ProjectService } from "@/server/projects/project-service";

import { StrategyService } from "./strategy-service";

const address = (value: string) => `0x${value.padStart(64, "0")}`;
const company = address("1");
const contributor = address("2");
const outsider = address("3");
const policy = {
  schemaVersion: 1 as const,
  displayName: "Cinder Baseline",
  rules: [{ minBoardCards: 0, action: "check" as const }],
  fallbackAction: "fold" as const,
};

async function setup() {
  const repositories = createMemoryRepositories();
  const keyProvider = createPreviewKeyProvider();
  let nextId = 0;
  const idFactory = () => `id-${++nextId}`;
  const projectService = new ProjectService({
    repositories: repositories.projects,
    keyProvider,
    walletHashPepper: "test-wallet-pepper-0123456789012345",
    now: () => new Date("2026-08-29T00:00:00.000Z"),
    idFactory,
  });
  const project = await projectService.createProject({ name: "Arena season", walletAddress: company });
  if (!project.ok) throw new Error(project.code);
  await projectService.inviteMember({
    projectId: project.value.id,
    actorWalletAddress: company,
    walletAddress: contributor,
    role: "contributor",
  });
  const service = new StrategyService({
    repositories: repositories.projects,
    keyProvider,
    walletHashPepper: "test-wallet-pepper-0123456789012345",
    now: () => new Date("2026-08-29T00:00:00.000Z"),
    idFactory,
  });
  return { repositories, projectId: project.value.id, service };
}

describe("StrategyService", () => {
  it("accepts a contributor strategy and returns only public commitment metadata", async () => {
    const { repositories, projectId, service } = await setup();
    const result = await service.submitStrategy({ projectId, actorWalletAddress: contributor, agentId: "CINDER", policy });

    expect(result).toMatchObject({
      ok: true,
      value: { projectId, agentId: "CINDER", displayName: "Cinder Baseline", status: "sealed" },
    });
    if (!result.ok) throw new Error(result.code);
    expect(result.value).not.toHaveProperty("policy");
    const stored = await repositories.projects.getArenaStrategyArtifact(projectId, "CINDER");
    expect(stored?.encryptedPolicy.ciphertext).not.toContain("Cinder Baseline");
  });

  it("refuses outsiders and duplicate agent submissions", async () => {
    const { projectId, service } = await setup();
    await expect(service.submitStrategy({ projectId, actorWalletAddress: outsider, agentId: "CINDER", policy }))
      .resolves.toEqual({ ok: false, code: "PROJECT_ACCESS_REQUIRED" });
    await expect(service.submitStrategy({ projectId, actorWalletAddress: contributor, agentId: "CINDER", policy }))
      .resolves.toMatchObject({ ok: true });
    await expect(service.submitStrategy({ projectId, actorWalletAddress: contributor, agentId: "CINDER", policy }))
      .resolves.toEqual({ ok: false, code: "STRATEGY_ARTIFACT_ALREADY_EXISTS" });
  });

  it("rejects invalid policies before storing an artifact", async () => {
    const { projectId, service } = await setup();
    await expect(service.submitStrategy({
      projectId,
      actorWalletAddress: contributor,
      agentId: "BROKEN",
      policy: { schemaVersion: 1, displayName: "", rules: [], fallbackAction: "fold" },
    })).resolves.toEqual({ ok: false, code: "INVALID_INPUT" });
  });
});
