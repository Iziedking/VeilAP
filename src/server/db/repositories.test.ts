import { describe, expect, it } from "vitest";

import type { AuthChallenge } from "@/server/auth/challenge";
import { createMemoryRepositories } from "./repositories";

const challenge = {
  nonce: "0xnonce",
  walletAddress: "0x1",
  origin: "http://127.0.0.1:3000",
  chainId: "SN_MAIN",
  issuedAt: "2026-08-27T18:00:00.000Z",
  expiresAt: "2026-08-27T18:05:00.000Z",
  typedData: {} as AuthChallenge["typedData"],
} satisfies AuthChallenge;

describe("memory repository contract", () => {
  it("consumes a nonce once and refuses replay", async () => {
    const repositories = createMemoryRepositories();
    await repositories.nonces.saveNonce({
      nonce: challenge.nonce,
      walletFingerprint: "fingerprint",
      challenge,
      digest: "digest",
      expiresAt: new Date(challenge.expiresAt),
    });

    const results = await Promise.all([
      repositories.nonces.consumeNonce(challenge.nonce, new Date("2026-08-27T18:01:00.000Z")),
      repositories.nonces.consumeNonce(challenge.nonce, new Date("2026-08-27T18:01:00.000Z")),
    ]);
    expect(results.filter((result) => result !== "REPLAYED" && result !== undefined)).toHaveLength(1);
    expect(results).toContain("REPLAYED");
  });

  it("keeps projects isolated by id", async () => {
    const repositories = createMemoryRepositories();
    await repositories.projects.saveProject({
      id: "project-alpha",
      name: "Alpha",
      ownerFingerprint: "owner",
      wrappedDataKey: "wrapped-alpha",
      createdAt: new Date("2026-08-27T18:00:00.000Z"),
    });

    await expect(repositories.projects.getProject("project-beta")).resolves.toBeUndefined();
    await expect(repositories.projects.getProject("project-alpha")).resolves.toMatchObject({
      wrappedDataKey: "wrapped-alpha",
    });
  });
});
