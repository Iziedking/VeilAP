import { describe, expect, it } from "vitest";

import { createProjectKeyMaterial } from "@/server/crypto/key-provider";
import { createPreviewKeyProvider } from "@/server/crypto/preview-key-provider";
import { createMemoryRepositories } from "@/server/db/repositories";
import {
  createMemoryStrategyArtifactStore,
  createRepositoryStrategyArtifactStore,
  openStrategyArtifact,
  submitStrategyArtifact,
} from "@/server/arena/strategy-artifacts";

const policy = {
  schemaVersion: 1 as const,
  displayName: "Cinder Baseline",
  rules: [{ minBoardCards: 0, action: "check" as const }],
  fallbackAction: "fold" as const,
};

describe("sealed strategy artifacts", () => {
  it("stores only an encrypted policy envelope and reopens it for the runner", async () => {
    const provider = createPreviewKeyProvider();
    const keyMaterial = await createProjectKeyMaterial(provider, "season-00");
    const store = createMemoryStrategyArtifactStore();
    const record = await submitStrategyArtifact({
      projectId: "season-00",
      agentId: "CINDER",
      policy,
      keyMaterial,
      store,
      idFactory: () => "artifact-1",
      now: () => new Date("2026-08-29T00:00:00.000Z"),
    });

    expect(record.status).toBe("sealed");
    expect(record.encryptedPolicy.ciphertext).not.toContain("Cinder Baseline");
    expect(record.artifactCommitment).toHaveLength(64);
    await expect(openStrategyArtifact({ record, keyMaterial })).resolves.toMatchObject({
      policy,
      agent: { id: "CINDER", artifactCommitment: record.artifactCommitment },
    });
  });

  it("rejects wrong project context and duplicate agent submissions", async () => {
    const provider = createPreviewKeyProvider();
    const keyMaterial = await createProjectKeyMaterial(provider, "season-00");
    const store = createMemoryStrategyArtifactStore();
    const record = await submitStrategyArtifact({
      projectId: "season-00",
      agentId: "CINDER",
      policy,
      keyMaterial,
      store,
      idFactory: () => "artifact-2",
    });
    const wrongContext = { ...record, projectId: "season-01" };
    await expect(openStrategyArtifact({ record: wrongContext, keyMaterial })).rejects.toThrow("ENVELOPE_AUTH_FAILED");
    await expect(submitStrategyArtifact({ projectId: "season-00", agentId: "CINDER", policy, keyMaterial, store })).rejects.toThrow("STRATEGY_ARTIFACT_ALREADY_EXISTS");
  });

  it("adapts the same sealed record contract to the VM Postgres repository", async () => {
    const provider = createPreviewKeyProvider();
    const keyMaterial = await createProjectKeyMaterial(provider, "season-00");
    const repository = createMemoryRepositories().projects;
    const store = createRepositoryStrategyArtifactStore(repository);
    const record = await submitStrategyArtifact({
      projectId: "season-00",
      agentId: "NIGHTJAR",
      policy,
      keyMaterial,
      store,
      idFactory: () => "artifact-repository-1",
    });
    await expect(store.get("season-00", "NIGHTJAR")).resolves.toEqual(record);
  });
});
