import { describe, expect, it } from "vitest";

import { ArenaReadinessService } from "./arena-readiness-service";

const completeConfig = {
  mode: "persisted" as const,
  databaseUrl: "postgresql://example.invalid/veilap",
  starknetRpcUrl: "https://rpc.example.invalid",
  sessionSecret: "s".repeat(64),
  walletHashPepper: "p".repeat(64),
  kmsKeyId: "arn:aws:kms:us-east-1:123456789012:key/example",
  awsRegion: "us-east-1",
  receiptSigningPrivateKey: "private",
  receiptSigningPublicKey: "public",
  arenaWorkerSecret: "w".repeat(64),
  arenaWorkerWalletAddress: "0x123",
  xOAuthClientId: "client-id",
  xOAuthClientSecret: "client-secret",
  xOAuthRedirectUri: "https://api.veilap.xyz/api/auth/x/callback",
  missing: [],
};

describe("ArenaReadinessService", () => {
  it("reports ready only when every production dependency is available", async () => {
    const service = new ArenaReadinessService({
      config: completeConfig,
      poolAddress: "0xabc",
      checkDatabase: async () => ({ database: true, arenaSchema: true }),
      checkKms: async () => true,
      checkReceiptSigning: () => true,
    });

    await expect(service.check()).resolves.toEqual({
      ready: true,
      mode: "persisted",
      checks: { database: true, arenaSchema: true, kms: true, receiptSigning: true, pool: true, worker: true, xVerification: true },
      blockers: [],
    });
  });

  it("returns safe blocker codes without exposing configuration values", async () => {
    const service = new ArenaReadinessService({
      config: { mode: "persisted", starknetRpcUrl: "", missing: [] },
      checkDatabase: async () => ({ database: false, arenaSchema: false }),
      checkKms: async () => false,
      checkReceiptSigning: () => false,
    });

    const report = await service.check();
    expect(report.ready).toBe(false);
    expect(report.blockers).toEqual([
      "DATABASE_UNAVAILABLE",
      "ARENA_SCHEMA_INCOMPLETE",
      "KMS_NOT_READY",
      "RECEIPT_SIGNING_NOT_READY",
      "STRK20_POOL_NOT_CONFIGURED",
      "ARENA_WORKER_NOT_CONFIGURED",
      "X_VERIFICATION_NOT_CONFIGURED",
    ]);
    expect(JSON.stringify(report)).not.toContain("example.invalid");
  });

  it("rejects configured-looking dependencies that fail live validation", async () => {
    const service = new ArenaReadinessService({
      config: { ...completeConfig, arenaWorkerSecret: "too-short" },
      poolAddress: "0xabc",
      checkDatabase: async () => ({ database: true, arenaSchema: true }),
      checkKms: async () => false,
      checkReceiptSigning: () => false,
    });

    const report = await service.check();
    expect(report.ready).toBe(false);
    expect(report.checks).toMatchObject({ kms: false, receiptSigning: false, worker: false });
    expect(report.blockers).toEqual([
      "KMS_NOT_READY",
      "RECEIPT_SIGNING_NOT_READY",
      "ARENA_WORKER_NOT_CONFIGURED",
    ]);
  });
});
