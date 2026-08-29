import { describe, expect, it } from "vitest";

import { createProjectKeyMaterial } from "@/server/crypto/key-provider";
import { createPreviewKeyProvider } from "@/server/crypto/preview-key-provider";
import {
  createMemoryStrategyArtifactStore,
  submitStrategyArtifact,
} from "@/server/arena/strategy-artifacts";
import { runSealedMatch } from "@/server/arena/sealed-match-runner";

const policy = (displayName: string, action: "check" | "call") => ({
  schemaVersion: 1 as const,
  displayName,
  rules: [{ minBoardCards: 0, action }],
  fallbackAction: "fold" as const,
});

describe("sealed match runner", () => {
  it("runs decrypted artifacts but returns only the public receipt", async () => {
    const provider = createPreviewKeyProvider();
    const keyMaterial = await createProjectKeyMaterial(provider, "season-00");
    const store = createMemoryStrategyArtifactStore();
    await submitStrategyArtifact({ projectId: "season-00", agentId: "NIGHTJAR", policy: policy("Nightjar", "call"), keyMaterial, store });
    await submitStrategyArtifact({ projectId: "season-00", agentId: "CINDER", policy: policy("Cinder", "check"), keyMaterial, store });

    const result = await runSealedMatch({
      projectId: "season-00",
      leftAgentId: "NIGHTJAR",
      rightAgentId: "CINDER",
      matchId: "M-032",
      seed: "sealed-test-seed",
      hands: 3,
      keyMaterial,
      store,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.decisionCount).toBe(6);
    expect(result.value.publicReceipt).not.toHaveProperty("hands");
    expect(result.value.publicReceipt).not.toHaveProperty("policy");
    expect(result.value.publicReceipt).not.toHaveProperty("holeCards");
    expect(Object.keys(result.value.publicReceipt.artifactCommitments)).toEqual(["NIGHTJAR", "CINDER"]);
  });

  it("refuses missing artifacts before the runner starts", async () => {
    const provider = createPreviewKeyProvider();
    const keyMaterial = await createProjectKeyMaterial(provider, "season-00");
    const result = await runSealedMatch({
      projectId: "season-00",
      leftAgentId: "NIGHTJAR",
      rightAgentId: "MISSING",
      matchId: "M-033",
      seed: "sealed-test-seed",
      hands: 1,
      keyMaterial,
      store: createMemoryStrategyArtifactStore(),
    });
    expect(result).toEqual({ ok: false, code: "SEALED_ARTIFACT_NOT_FOUND", agentId: "NIGHTJAR" });
  });
});
