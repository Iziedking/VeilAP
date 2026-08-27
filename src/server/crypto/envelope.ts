import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { ProjectKeyMaterial } from "./key-provider";

export type EncryptedField = {
  version: 1;
  algorithm: "AES-256-GCM";
  iv: string;
  ciphertext: string;
  authTag: string;
};

export interface EnvelopeContext {
  projectId: string;
  recordType: string;
  recordId: string;
  fieldName: string;
}

function aad(context: EnvelopeContext): Buffer {
  return Buffer.from(
    `veilap:v1:${context.projectId}:${context.recordType}:${context.recordId}:${context.fieldName}`,
    "utf8",
  );
}

function keyBytes(material: Uint8Array): Buffer {
  if (material.byteLength !== 32) throw new Error("ENVELOPE_KEY_INVALID");
  return Buffer.from(material);
}

export function encryptField(
  plaintext: string,
  context: EnvelopeContext,
  material: ProjectKeyMaterial | Uint8Array,
): EncryptedField {
  const key = keyBytes(material instanceof Uint8Array ? material : material.dataKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    version: 1,
    algorithm: "AES-256-GCM",
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
}

export function decryptField(
  envelope: EncryptedField,
  context: EnvelopeContext,
  material: ProjectKeyMaterial | Uint8Array,
): string {
  try {
    if (envelope.version !== 1 || envelope.algorithm !== "AES-256-GCM") {
      throw new Error("ENVELOPE_VERSION_UNSUPPORTED");
    }
    const key = keyBytes(material instanceof Uint8Array ? material : material.dataKey);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64url"));
    decipher.setAAD(aad(context));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("ENVELOPE_AUTH_FAILED");
  }
}
