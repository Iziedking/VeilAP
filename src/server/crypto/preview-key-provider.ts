import { randomBytes } from "node:crypto";

import type { KeyProvider } from "./key-provider";

// Preview data is memory-only and is never a production substitute for AWS KMS.
export function createPreviewKeyProvider(): KeyProvider {
  const keys = new Map<string, Uint8Array>();
  return {
    async wrap(dataKey, projectId) {
      const wrappedKey = `preview:${projectId}:${randomBytes(12).toString("hex")}`;
      keys.set(wrappedKey, new Uint8Array(dataKey));
      return wrappedKey;
    },
    async unwrap(wrappedKey, projectId) {
      if (!wrappedKey.startsWith(`preview:${projectId}:`)) throw new Error("PREVIEW_KEY_CONTEXT_MISMATCH");
      const dataKey = keys.get(wrappedKey);
      if (!dataKey) throw new Error("PREVIEW_KEY_NOT_FOUND");
      return new Uint8Array(dataKey);
    },
  };
}
