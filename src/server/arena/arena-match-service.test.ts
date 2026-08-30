import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createPreviewKeyProvider } from "@/server/crypto/preview-key-provider";
import { createMemoryRepositories } from "@/server/db/repositories";
import { ProjectService } from "@/server/projects/project-service";

import { StrategyService } from "./strategy-service";
import { ArenaMatchService } from "./arena-match-service";
import { createReceiptSigner, verifySignedArenaMatchReceipt } from "@/server/receipts/signing";

const address = (value: string) => "0x" + value.padStart(64, "0");
const company = address("1");
const contributor = address("2");
const policy = (displayName: string, fallbackAction: "fold" | "check" | "raise") => ({
  schemaVersion: 1 as const,
  displayName,
  rules: [{ minBoardCards: 0, action: fallbackAction }],
  fallbackAction,
});

async function setup(actions: { cinder?: "fold" | "check" | "raise"; ember?: "fold" | "check" | "raise" } = {}) {
  const repositories = createMemoryRepositories();
  const keyProvider = createPreviewKeyProvider();
  const pair = generateKeyPairSync("ed25519");
  const privateKeyBase64 = pair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64");
  const publicKeyBase64 = pair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
  let nextId = 0;
  const idFactory = () => "id-" + ++nextId;
  const dependencies = {
    repositories: repositories.projects,
    keyProvider,
    walletHashPepper: "test-wallet-pepper-0123456789012345",
    signer: createReceiptSigner({ privateKeyBase64, publicKeyBase64 }),
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
    policy: policy("Cinder", actions.cinder ?? "check"),
  });
  if (!cinder.ok) throw new Error("TEST_CINDER_" + cinder.code);
  const ember = await strategies.submitStrategy({
    projectId: project.value.id,
    actorWalletAddress: contributor,
    agentId: "EMBER",
    policy: policy("Ember", actions.ember ?? "raise"),
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
    publicKeyBase64,
  };
}

describe("ArenaMatchService", () => {
  it("runs real sealed policies and persists only the public receipt", async () => {
    const { repositories, projectId, service, publicKeyBase64 } = await setup();
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
    expect(result.value.signedReceipt?.publicKeyId).toMatch(/^receipt-key-/);
    expect(result.value.signedReceipt).toBeDefined();
    expect(verifySignedArenaMatchReceipt(result.value.signedReceipt!, publicKeyBase64)).toBe(true);

    const stored = await repositories.projects.getArenaMatchReceipt(projectId, result.value.matchId);
    expect(stored?.encryptedSeed.ciphertext).not.toContain("server-generated-secret-seed");
    expect(stored?.publicReceipt).toHaveProperty("transcriptRoot");
    expect(stored?.publicReceipt).not.toHaveProperty("hands");
    expect(stored?.signedReceipt).toEqual(result.value.signedReceipt);
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

  it("selectively reveals one losing action with a real inclusion proof", async () => {
    const { repositories, projectId, service } = await setup({ cinder: "fold", ember: "raise" });
    const match = await service.runMatch({
      projectId,
      actorWalletAddress: company,
      leftAgentId: "CINDER",
      rightAgentId: "EMBER",
      hands: 3,
    });
    expect(match.ok).toBe(true);
    if (!match.ok) throw new Error(match.code);

    const reveal = await service.revealLosingAction({
      projectId,
      actorWalletAddress: company,
      matchId: match.value.matchId,
      handIndex: 1,
    });
    expect(reveal.ok).toBe(true);
    if (!reveal.ok) throw new Error(reveal.code);
    expect(reveal.value.action).toBe("fold");
    expect(reveal.value.handIndex).toBe(1);
    expect(reveal.value.proof).toEqual(expect.any(Array));
    expect(JSON.stringify(reveal.value)).not.toContain("holeCards");
    expect(JSON.stringify(reveal.value)).not.toContain("policy");

    const stored = await repositories.projects.getArenaMatchReveal(projectId, match.value.matchId);
    expect(stored?.agentId).toBe("CINDER");
    const publicArena = await service.getPublicArena(projectId);
    expect(publicArena.ok).toBe(true);
    if (!publicArena.ok) throw new Error(publicArena.code);
    expect(publicArena.value.matches[0]?.selectiveReveal?.action).toBe("fold");

    const duplicate = await service.revealLosingAction({
      projectId,
      actorWalletAddress: company,
      matchId: match.value.matchId,
      handIndex: 3,
    });
    expect(duplicate).toEqual(reveal);
  });
});
