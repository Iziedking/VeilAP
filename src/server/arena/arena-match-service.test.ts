import { describe, expect, it } from "vitest";

import { createPreviewKeyProvider } from "@/server/crypto/preview-key-provider";
import { createMemoryRepositories } from "@/server/db/repositories";
import { ProjectService } from "@/server/projects/project-service";

import { StrategyService } from "./strategy-service";
import { ArenaMatchService } from "./arena-match-service";

const address = (value: string) => "0x" + value.padStart(64, "0");
const company = address("1");
const contributor = address("2");
const policy = (displayName: string, fallbackAction: "fold" | "check" | "raise") => ({
  schemaVersion: 1 as const,
  displayName,
  rules: [{ minBoardCards: 0, action: fallbackAction }],
  fallbackAction,
});

async function setup() {
  const repositories = createMemoryRepositories();
  const keyProvider = createPreviewKeyProvider();
  let nextId = 0;
  const idFactory = () => "id-" + ++nextId;
  const dependencies = {
    repositories: repositories.projects,
    keyProvider,
    walletHashPepper: "test-wallet-pepper-0123456789012345",
    now: () => new Date("2026-08-29T00:00:00.000Z"),
    idFactory,
  };
  const projectService = new ProjectService(dependencies);
  const project = await projectService.createProject({ name: "Arena season", walletAddress: company });
  if (!project.ok) throw new Error(project.code);
  const invitation = await projectService.inviteMember({
    projectId: project.value.id,
    actorWalletAddress: company,
    walletAddress: contributor,
    role: "contributor",
  });
  if (!invitation.ok) throw new Error(invitation.code);
  const strategies = new StrategyService(dependencies);
  const cinder = await strategies.submitStrategy({
    projectId: project.value.id,
    actorWalletAddress: contributor,
    agentId: "CINDER",
    policy: policy("Cinder", "check"),
  });
  if (!cinder.ok) throw new Error("TEST_CINDER_" + cinder.code);
  const ember = await strategies.submitStrategy({
    projectId: project.value.id,
    actorWalletAddress: contributor,
    agentId: "EMBER",
    policy: policy("Ember", "raise"),
  });
  if (!ember.ok) throw new Error("TEST_EMBER_" + ember.code);
  if (!(await repositories.projects.getArenaStrategyArtifact(project.value.id, "CINDER"))) {
    throw new Error("TEST_CINDER_ARTIFACT_MISSING");
  }
  if (!(await repositories.projects.getArenaStrategyArtifact(project.value.id, "EMBER"))) {
    throw new Error("TEST_EMBER_ARTIFACT_MISSING");
  }
  return {
    repositories,
    projectId: project.value.id,
    service: new ArenaMatchService({
      ...dependencies,
      seedFactory: () => "server-generated-secret-seed",
    }),
  };
}

describe("ArenaMatchService", () => {
  it("runs real sealed policies and persists only the public receipt", async () => {
    const { repositories, projectId, service } = await setup();
    const result = await service.runMatch({
      projectId,
      actorWalletAddress: company,
      leftAgentId: "CINDER",
      rightAgentId: "EMBER",
      hands: 3,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.value.matchId).toMatch(/^id-/);
    expect(result.value.players.map((player) => player.displayName)).toEqual(["Cinder", "Ember"]);
    expect(result.value.transcriptRoot).toMatch(/^[a-f0-9]{64}$/);

    const stored = await repositories.projects.getArenaMatchReceipt(projectId, result.value.matchId);
    expect(stored?.encryptedSeed.ciphertext).not.toContain("server-generated-secret-seed");
    expect(stored?.publicReceipt).toHaveProperty("transcriptRoot");
    expect(stored?.publicReceipt).not.toHaveProperty("hands");
  });

  it("builds a public leaderboard from persisted receipts", async () => {
    const { projectId, service } = await setup();
    await service.runMatch({
      projectId,
      actorWalletAddress: company,
      leftAgentId: "CINDER",
      rightAgentId: "EMBER",
      hands: 2,
    });

    const result = await service.getPublicArena(projectId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.code);
    expect(result.value.matches).toHaveLength(1);
    expect(result.value.leaderboard).toHaveLength(2);
    expect(result.value.leaderboard.every((entry) => entry.matches === 1)).toBe(true);
  });
});
