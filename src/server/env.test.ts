import { describe, expect, it } from "vitest";

import { readServerConfig } from "./env";

describe("server configuration", () => {
  it("allows preview to boot without persisted credentials", () => {
    const config = readServerConfig({ NEXT_PUBLIC_VEILAP_PREVIEW_MODE: "1" });

    expect(config.mode).toBe("preview");
    expect(config.missing).toEqual([]);
  });

  it("reports missing persisted configuration without exposing values", () => {
    const config = readServerConfig({ NEXT_PUBLIC_VEILAP_PREVIEW_MODE: "0" });

    expect(config.mode).toBe("persisted");
    expect(config.missing).toContain("DATABASE_URL");
    expect(config.missing).toContain("VEILAP_KMS_KEY_ID");
  });

  it("accepts a complete persisted configuration", () => {
    const config = readServerConfig({
      NEXT_PUBLIC_VEILAP_PREVIEW_MODE: "0",
      DATABASE_URL: "postgresql://example.invalid/veilap",
      STARKNET_RPC_URL: "https://rpc.example.invalid",
      VEILAP_SESSION_SECRET: "a".repeat(64),
      VEILAP_WALLET_HASH_PEPPER: "b".repeat(64),
      VEILAP_KMS_KEY_ID: "arn:aws:kms:eu-west-1:000000000000:key/test",
      AWS_REGION: "eu-west-1",
      VEILAP_RECEIPT_SIGNING_PRIVATE_KEY: "private-key",
      VEILAP_RECEIPT_SIGNING_PUBLIC_KEY: "public-key",
    });

    expect(config.missing).toEqual([]);
  });
});
