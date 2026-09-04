import { describe, expect, it } from "vitest";

import { createMemoryRepositories } from "@/server/db/repositories";
import { ParticipantAgentService } from "./participant-agent-service";

const PACKAGE = {
  protocolVersion: "veil-agent.v1",
  engineVersion: "holdem-sealed-v0.3",
  agentId: "TEST_BOT",
  displayName: "Test Bot",
  policy: {
    rules: [{ when: { minHandStrength: 4 }, action: "raise" }],
    fallbackAction: "fold",
  },
};

describe("ParticipantAgentService", () => {
  it("saves a wallet-owned package without returning its encrypted payload", async () => {
    const repositories = createMemoryRepositories().projects;
    const service = new ParticipantAgentService({
      repositories,
      walletHashPepper: "p".repeat(32),
      sessionSecret: "s".repeat(32),
      vaultKeys: { currentKeyId: "test-v1", keys: { "test-v1": "ab".repeat(32) } },
      idFactory: () => "saved-agent-1",
      now: () => new Date("2026-09-02T12:00:00.000Z"),
    });

    const saved = await service.save({ actorWalletAddress: "0x123", agentPackage: PACKAGE });
    expect(saved).toMatchObject({ agentId: "TEST_BOT", displayName: "Test Bot", version: 1 });
    expect(saved).not.toHaveProperty("encryptedPackage");
    expect(await service.list("0x123")).toHaveLength(1);

    const opened = await service.open({ actorWalletAddress: "0x123", agentId: "TEST_BOT" });
    expect(opened?.agentPackage).toEqual(PACKAGE);
  });

  it("increments the private package version when the same agent is updated", async () => {
    const repositories = createMemoryRepositories().projects;
    const service = new ParticipantAgentService({
      repositories,
      walletHashPepper: "p".repeat(32),
      sessionSecret: "s".repeat(32),
      vaultKeys: { currentKeyId: "test-v1", keys: { "test-v1": "ab".repeat(32) } },
      idFactory: () => "saved-agent-1",
    });

    await service.save({ actorWalletAddress: "0x123", agentPackage: PACKAGE });
    const updated = await service.save({
      actorWalletAddress: "0x123",
      agentPackage: { ...PACKAGE, displayName: "Test Bot Updated" },
    });
    expect(updated.version).toBe(2);
    expect((await service.list("0x123"))[0]?.displayName).toBe("Test Bot Updated");
  });
});


it("rewraps retained keys without changing identity, version, timestamps or package", async () => {
  const repositories = createMemoryRepositories().projects;
  const base = { repositories, walletHashPepper: "p".repeat(32), sessionSecret: "s".repeat(64) };
  const first = new ParticipantAgentService({ ...base, vaultKeys: { currentKeyId: "old", keys: { old: "ab".repeat(32) } } });
  const saved = await first.save({ actorWalletAddress: "0x123", agentPackage: PACKAGE });
  const rotating = new ParticipantAgentService({ ...base, sessionSecret: "r".repeat(64), vaultKeys: { currentKeyId: "new", keys: { old: "ab".repeat(32), new: "cd".repeat(32) } } });
  expect((await rotating.open({ actorWalletAddress: "0x123", agentId: "TEST_BOT" }))?.agentPackage).toEqual(PACKAGE);
  expect(await rotating.rewrap({ actorWalletAddress: "0x123", agentId: "TEST_BOT" })).toEqual(saved);
  const after = new ParticipantAgentService({ ...base, sessionSecret: "r".repeat(64), vaultKeys: { currentKeyId: "new", keys: { new: "cd".repeat(32) } } });
  expect((await after.open({ actorWalletAddress: "0x123", agentId: "TEST_BOT" }))?.agentPackage).toEqual(PACKAGE);
  expect(await after.open({ actorWalletAddress: "0x999", agentId: "TEST_BOT" })).toBeNull();
});

it("can read and explicitly rewrap a legacy session-encrypted package", async () => {
  const { createHash } = await import("node:crypto");
  const { encryptField } = await import("@/server/crypto/envelope");
  const repositories = createMemoryRepositories().projects;
  const first = new ParticipantAgentService({ repositories, walletHashPepper: "p".repeat(32), sessionSecret: "s".repeat(64), vaultKeys: { currentKeyId: "new", keys: { new: "cd".repeat(32) } } });
  await first.save({ actorWalletAddress: "0x123", agentPackage: PACKAGE });
  const { fingerprintWallet } = await import("@/server/privacy/wallet-fingerprint");
  const owner = fingerprintWallet("0x123", "p".repeat(32));
  const record = (await repositories.getParticipantAgentPackage(owner, "TEST_BOT"))!;
  const key = createHash("sha256").update("veilap:participant-agent-vault:v1:").update("s".repeat(64)).digest();
  await repositories.saveParticipantAgentPackage({ ...record, encryptedPackage: encryptField(JSON.stringify(PACKAGE), { projectId: "participant-agent-vault", recordType: "participant_agent_package", recordId: record.id, fieldName: "package" }, key) });
  const rotated = new ParticipantAgentService({ repositories, walletHashPepper: "p".repeat(32), sessionSecret: "r".repeat(64), vaultKeys: { currentKeyId: "new", keys: { new: "cd".repeat(32) }, legacySessionSecrets: ["s".repeat(64)] } });
  await rotated.rewrap({ actorWalletAddress: "0x123", agentId: "TEST_BOT" });
  expect((await first.open({ actorWalletAddress: "0x123", agentId: "TEST_BOT" }))?.agentPackage).toEqual(PACKAGE);
});
