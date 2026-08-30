import type { KMSClient } from "@aws-sdk/client-kms";
import { describe, expect, it, vi } from "vitest";

import { checkKmsKeyAccess } from "./kms-key-provider";

function clientWith(result: unknown): KMSClient {
  return {
    send: vi.fn().mockResolvedValue(result),
  } as unknown as KMSClient;
}

describe("checkKmsKeyAccess", () => {
  it("accepts only an enabled encrypt and decrypt key", async () => {
    await expect(checkKmsKeyAccess({
      keyId: "arn:aws:kms:us-east-1:123456789012:key/test",
      region: "us-east-1",
      client: clientWith({ KeyMetadata: { Enabled: true, KeyUsage: "ENCRYPT_DECRYPT" } }),
    })).resolves.toBe(true);

    await expect(checkKmsKeyAccess({
      keyId: "arn:aws:kms:us-east-1:123456789012:key/test",
      region: "us-east-1",
      client: clientWith({ KeyMetadata: { Enabled: false, KeyUsage: "ENCRYPT_DECRYPT" } }),
    })).resolves.toBe(false);
  });

  it("fails closed when KMS is unavailable", async () => {
    const client = {
      send: vi.fn().mockRejectedValue(new Error("access denied")),
    } as unknown as KMSClient;
    await expect(checkKmsKeyAccess({
      keyId: "arn:aws:kms:us-east-1:123456789012:key/test",
      region: "us-east-1",
      client,
    })).resolves.toBe(false);
  });
});
