import { createHmac, timingSafeEqual } from "node:crypto";

import { validateAndParseAddress } from "starknet";

export interface WalletSession {
  walletAddress: string;
  issuedAt: string;
  expiresAt: string;
}

function assertSecret(secret: string) {
  if (secret.length < 32) throw new Error("SESSION_SECRET_WEAK");
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function parsePayload(payload: string): WalletSession | undefined {
  try {
    const value: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!value || typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    if (
      typeof record.walletAddress !== "string" ||
      typeof record.issuedAt !== "string" ||
      typeof record.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(record.issuedAt)) ||
      !Number.isFinite(Date.parse(record.expiresAt))
    ) {
      return undefined;
    }
    return {
      walletAddress: validateAndParseAddress(record.walletAddress),
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
    };
  } catch {
    return undefined;
  }
}

export function createSessionToken(session: WalletSession, secret: string): string {
  assertSecret(secret);
  const normalized: WalletSession = {
    ...session,
    walletAddress: validateAndParseAddress(session.walletAddress),
  };
  const payload = Buffer.from(JSON.stringify(normalized), "utf8").toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string, secret: string, now = Date.now()) {
  try {
    assertSecret(secret);
    const parts = token.split(".");
    if (parts.length !== 2) {
      return { ok: false as const, code: "SESSION_INVALID" as const };
    }
    const [payload, supplied] = parts;
    const expected = sign(payload, secret);
    const suppliedBytes = Buffer.from(supplied, "base64url");
    const expectedBytes = Buffer.from(expected, "base64url");
    if (
      suppliedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(suppliedBytes, expectedBytes)
    ) {
      return { ok: false as const, code: "SESSION_INVALID" as const };
    }
    const session = parsePayload(payload);
    if (!session) {
      return { ok: false as const, code: "SESSION_INVALID" as const };
    }
    if (Date.parse(session.expiresAt) <= now) {
      return { ok: false as const, code: "SESSION_EXPIRED" as const };
    }
    return { ok: true as const, session };
  } catch {
    return { ok: false as const, code: "SESSION_INVALID" as const };
  }
}
