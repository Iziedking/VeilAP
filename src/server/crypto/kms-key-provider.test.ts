import type { KMSClient } from "@aws-sdk/client-kms";
import { describe, expect, it, vi } from "vitest";

import { checkKmsKeyAccess, KmsKeyProvider } from "./kms-key-provider";

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

it("aborts an unavailable KMS unwrap instead of retaining a blocked worker call", async () => {
  const controller = new AbortController();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
  try {
    const client = { send: (_command: unknown, options: { abortSignal: AbortSignal }) => new Promise((_resolve, reject) => { options.abortSignal.addEventListener("abort", () => reject(new Error("KMS_ABORTED")), { once: true }); }) } as unknown as KMSClient;
    const provider = new KmsKeyProvider({ keyId: "test-key", region: "us-east-1", client });
    const result = provider.unwrap("test-wrapped-key", "test-project");
    const rejected = expect(result).rejects.toThrow("KMS_ABORTED");
    controller.abort();
    await rejected;
    expect(timeout).toHaveBeenCalledWith(10_000);
  } finally { timeout.mockRestore(); }
});
