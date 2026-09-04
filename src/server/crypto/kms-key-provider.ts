import {
  DecryptCommand,
  DescribeKeyCommand,
  EncryptCommand,
  KMSClient,
} from "@aws-sdk/client-kms";

import type { KeyProvider } from "./key-provider";

export interface KmsKeyProviderOptions {
  keyId: string;
  region: string;
  client?: KMSClient;
}

export async function checkKmsKeyAccess(options: KmsKeyProviderOptions): Promise<boolean> {
  if (!options.keyId.trim() || !options.region.trim()) return false;
  const client = options.client ?? new KMSClient({ region: options.region });
  try {
    const result = await client.send(new DescribeKeyCommand({ KeyId: options.keyId }), { abortSignal: AbortSignal.timeout(10_000) });
    return result.KeyMetadata?.Enabled === true
      && result.KeyMetadata.KeyUsage === "ENCRYPT_DECRYPT";
  } catch {
    return false;
  }
}

export class KmsKeyProvider implements KeyProvider {
  private readonly client: KMSClient;
  private readonly keyId: string;

  constructor(options: KmsKeyProviderOptions) {
    this.client = options.client ?? new KMSClient({ region: options.region });
    this.keyId = options.keyId;
  }

  async wrap(dataKey: Uint8Array, projectId: string): Promise<string> {
    // @aws-sdk/client-kms@3.1119.0 EncryptCommand; AWS KMS symmetric envelope wrapping, read 2026-08-27.
    const result = await this.client.send(
      new EncryptCommand({
        KeyId: this.keyId,
        Plaintext: dataKey,
        EncryptionContext: { projectId },
      }),
      // AWS SDK v3 send httpOptions abortSignal, reviewed 2026-09-04.
      { abortSignal: AbortSignal.timeout(10_000) },
    );
    if (!result.CiphertextBlob) throw new Error("KMS_WRAP_FAILED");
    return Buffer.from(result.CiphertextBlob).toString("base64url");
  }

  async unwrap(wrappedKey: string, projectId: string): Promise<Uint8Array> {
    // @aws-sdk/client-kms@3.1119.0 DecryptCommand; the project context prevents cross-project key reuse.
    const result = await this.client.send(
      new DecryptCommand({
        CiphertextBlob: Buffer.from(wrappedKey, "base64url"),
        EncryptionContext: { projectId },
        KeyId: this.keyId,
      }),
      // AWS SDK v3 send httpOptions abortSignal, reviewed 2026-09-04.
      { abortSignal: AbortSignal.timeout(10_000) },
    );
    if (!result.Plaintext) throw new Error("KMS_UNWRAP_FAILED");
    const dataKey = new Uint8Array(result.Plaintext);
    if (dataKey.byteLength !== 32) throw new Error("KMS_DATA_KEY_INVALID");
    return dataKey;
  }
}
