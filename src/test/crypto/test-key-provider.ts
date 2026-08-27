import { randomBytes } from "node:crypto";

import type { KeyProvider } from "@/server/crypto/key-provider";

export function createTestKeyProvider(): KeyProvider {
  const keys = new Map<string, Uint8Array>();

  return {
    async wrap(dataKey, projectId) {
      const wrappedKey = `${projectId}:${Buffer.from(randomBytes(8)).toString("hex")}`;
      keys.set(wrappedKey, new Uint8Array(dataKey));
      return wrappedKey;
    },
    async unwrap(wrappedKey, projectId) {
      if (!wrappedKey.startsWith(`${projectId}:`)) throw new Error("KMS_CONTEXT_MISMATCH");
      const key = keys.get(wrappedKey);
      if (!key) throw new Error("KMS_KEY_NOT_FOUND");
      return new Uint8Array(key);
    },
  };
}
