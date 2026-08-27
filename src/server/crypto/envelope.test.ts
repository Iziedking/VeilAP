import { describe, expect, it } from "vitest";

import { createProjectKeyMaterial } from "./key-provider";
import { createTestKeyProvider } from "@/test/crypto/test-key-provider";
import { decryptField, encryptField } from "./envelope";

const context = {
  projectId: "project-alpha",
  recordType: "agreement",
  recordId: "agreement-1",
  fieldName: "brief",
};

describe("encrypted field envelope", () => {
  it("round-trips plaintext without storing it in the envelope", async () => {
    const provider = createTestKeyProvider();
    const material = await createProjectKeyMaterial(provider, context.projectId);
    const envelope = encryptField("incident response scope", context, material);

    expect(envelope.ciphertext).not.toContain("incident response scope");
    await expect(Promise.resolve(decryptField(envelope, context, material))).resolves.toBe(
      "incident response scope",
    );
  });

  it("uses a different IV for each encryption", async () => {
    const provider = createTestKeyProvider();
    const material = await createProjectKeyMaterial(provider, context.projectId);
    const first = encryptField("same secret", context, material);
    const second = encryptField("same secret", context, material);

    expect(second.iv).not.toBe(first.iv);
    expect(second.ciphertext).not.toBe(first.ciphertext);
  });

  it("rejects a different project context", async () => {
    const provider = createTestKeyProvider();
    const material = await createProjectKeyMaterial(provider, context.projectId);
    const envelope = encryptField("sensitive brief", context, material);

    expect(() => decryptField(envelope, { ...context, projectId: "project-beta" }, material)).toThrow(
      "ENVELOPE_AUTH_FAILED",
    );
  });

  it("rejects a changed authentication tag", async () => {
    const provider = createTestKeyProvider();
    const material = await createProjectKeyMaterial(provider, context.projectId);
    const envelope = encryptField("sensitive brief", context, material);

    expect(() =>
      decryptField(
        { ...envelope, authTag: `${envelope.authTag.slice(0, -2)}aa` },
        context,
        material,
      ),
    ).toThrow("ENVELOPE_AUTH_FAILED");
  });

  it("rejects a changed AAD field name", async () => {
    const provider = createTestKeyProvider();
    const material = await createProjectKeyMaterial(provider, context.projectId);
    const envelope = encryptField("sensitive brief", context, material);

    expect(() => decryptField(envelope, { ...context, fieldName: "other-field" }, material)).toThrow(
      "ENVELOPE_AUTH_FAILED",
    );
  });
});
