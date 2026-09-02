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
