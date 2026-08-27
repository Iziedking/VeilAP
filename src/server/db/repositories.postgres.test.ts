import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";

import type { AuthChallenge } from "@/server/auth/challenge";
import { getDatabase } from "./client";
import { createPostgresRepositories, pingDatabase } from "./repositories";

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("Postgres repository integration", () => {
  it("persists and atomically consumes an authentication nonce", async () => {
    const db = getDatabase(databaseUrl);
    await pingDatabase(db);
    const repositories = createPostgresRepositories(db);
    const nonce = `0x${randomBytes(24).toString("hex")}`;
    const challenge = {
      nonce,
      walletAddress: "0x1",
      origin: "http://127.0.0.1:3000",
      chainId: "SN_MAIN",
      issuedAt: "2026-08-27T18:00:00.000Z",
      expiresAt: "2099-08-27T18:05:00.000Z",
      typedData: {},
    } as AuthChallenge;

    try {
      await repositories.nonces.saveNonce({
        nonce,
        walletFingerprint: "integration-fingerprint",
        challenge,
        digest: "integration-digest",
        expiresAt: new Date(challenge.expiresAt),
      });
      const consumed = await repositories.nonces.consumeNonce(nonce, new Date("2026-08-27T18:01:00.000Z"));
      expect(consumed).toMatchObject({ nonce, digest: "integration-digest" });
      await expect(
        repositories.nonces.consumeNonce(nonce, new Date("2026-08-27T18:01:00.000Z")),
      ).resolves.toBe("REPLAYED");
    } finally {
      await db.execute(sql`delete from auth_nonces where nonce = ${nonce}`);
    }
  });
});
