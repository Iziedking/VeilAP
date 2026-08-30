import { createPrivateKey, createPublicKey, sign, timingSafeEqual, verify } from "node:crypto";

import { canonicalize, commitment } from "@/domain/canonical";
import {
  signedArenaMatchReceiptSchema,
  signedReceiptSchema,
  type ArenaMatchReceiptPayload,
  type ReceiptPayload,
  type SignedArenaMatchReceipt,
  type SignedReceipt,
} from "./schemas";

export interface ReceiptPublicKey {
  algorithm: "ed25519";
  publicKey: string;
  publicKeyId: string;
}

export interface ReceiptSigner {
  signPayload(payload: ReceiptPayload): SignedReceipt;
  signArenaMatchReceipt(payload: ArenaMatchReceiptPayload): SignedArenaMatchReceipt;
  publicKey(): ReceiptPublicKey;
}

export interface ReceiptSignerConfig {
  privateKeyBase64: string;
  publicKeyBase64: string;
}

function decodeKey(value: string, label: string): Buffer {
  if (!value.trim()) throw new Error(`${label}_MISSING`);
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 0) throw new Error(`${label}_INVALID`);
  return decoded;
}

function keyId(publicKeyBase64: string): string {
  return `receipt-key-${commitment(publicKeyBase64).slice(0, 16)}`;
}

function assertMatchingKeys(privateKey: ReturnType<typeof createPrivateKey>, publicKey: ReturnType<typeof createPublicKey>): void {
  const derived = createPublicKey(privateKey).export({ type: "spki", format: "der" });
  const configured = publicKey.export({ type: "spki", format: "der" });
  if (derived.length !== configured.length || !timingSafeEqual(derived, configured)) {
    throw new Error("RECEIPT_SIGNING_KEY_MISMATCH");
  }
}

export function createReceiptSigner(config: ReceiptSignerConfig): ReceiptSigner {
  const privateKey = createPrivateKey({ key: decodeKey(config.privateKeyBase64, "RECEIPT_PRIVATE_KEY"), type: "pkcs8", format: "der" });
  const publicKey = createPublicKey({ key: decodeKey(config.publicKeyBase64, "RECEIPT_PUBLIC_KEY"), type: "spki", format: "der" });
  assertMatchingKeys(privateKey, publicKey);
  const publicKeyId = keyId(config.publicKeyBase64);

  return {
    signPayload(payload) {
      return signReceiptPayload(signedReceiptSchema, signedPayload(payload), privateKey, publicKeyId);
    },
    signArenaMatchReceipt(payload) {
      return signReceiptPayload(signedArenaMatchReceiptSchema, payload, privateKey, publicKeyId);
    },
    publicKey() {
      return { algorithm: "ed25519", publicKey: config.publicKeyBase64, publicKeyId };
    },
  };
}

function signReceiptPayload<T extends { payload: unknown; signature: string; algorithm: "ed25519"; publicKeyId: string; payloadDigest: string }>(
  schema: { parse(value: unknown): T },
  payload: unknown,
  privateKey: ReturnType<typeof createPrivateKey>,
  publicKeyId: string,
): T {
  const serialized = canonicalize(payload);
  const signature = sign(null, Buffer.from(serialized, "utf8"), privateKey).toString("base64url");
  return schema.parse({
    payload,
    signature,
    algorithm: "ed25519",
    publicKeyId,
    payloadDigest: commitment(payload),
  });
}

function signedPayload(payload: ReceiptPayload): ReceiptPayload {
  if (payload.audience === "company") return payload;
  if (payload.audience === "contributor") return payload;
  return payload;
}

export function verifySignedReceipt(
  receipt: SignedReceipt,
  publicKeyBase64: string,
  now: Date = new Date(),
): boolean {
  const parsed = signedReceiptSchema.safeParse(receipt);
  if (!parsed.success) return false;
  const value = parsed.data;
  const issuedAt = Date.parse(value.payload.issuedAt);
  const expiresAt = Date.parse(value.payload.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > now.getTime() || expiresAt <= now.getTime()) {
    return false;
  }
  if (commitment(value.payload) !== value.payloadDigest) return false;
  const publicKey = createPublicKey({ key: decodeKey(publicKeyBase64, "RECEIPT_PUBLIC_KEY"), type: "spki", format: "der" });
  const serialized = canonicalize(value.payload);
  return verify(null, Buffer.from(serialized, "utf8"), publicKey, Buffer.from(value.signature, "base64url"));
}

export function verifySignedArenaMatchReceipt(
  receipt: SignedArenaMatchReceipt,
  publicKeyBase64: string,
): boolean {
  try {
    const parsed = signedArenaMatchReceiptSchema.safeParse(receipt);
    if (!parsed.success) return false;
    const value = parsed.data;
    if (commitment(value.payload) !== value.payloadDigest) return false;
    const publicKey = createPublicKey({ key: decodeKey(publicKeyBase64, "RECEIPT_PUBLIC_KEY"), type: "spki", format: "der" });
    const serialized = canonicalize(value.payload);
    return verify(null, Buffer.from(serialized, "utf8"), publicKey, Buffer.from(value.signature, "base64url"));
  } catch {
    return false;
  }
}
