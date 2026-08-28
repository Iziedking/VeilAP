import { randomBytes } from "node:crypto";

import { createAuthChallengeService, type ChallengePersistence } from "./challenge";
import { getDatabase } from "@/server/db/client";
import { createMemoryRepositories, createPostgresRepositories } from "@/server/db/repositories";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";
import { canAuthenticate, isLoopbackOrigin, readServerConfig, requirePersistedConfig } from "@/server/env";

export const SESSION_COOKIE = "veilap_session";
export const SESSION_TTL_MS = 8 * 60 * 60_000;

const authChallenges = createAuthChallengeService();
const memoryRepositories = createMemoryRepositories();
let durableChallenges: ReturnType<typeof createAuthChallengeService> | undefined;
let durableRepositories: ReturnType<typeof createPostgresRepositories> | undefined;
const developmentSecret = randomBytes(32).toString("hex");

export function hasDurableAuthStore(): boolean {
  const config = readServerConfig();
  return config.mode === "persisted" && config.missing.length === 0;
}

export function hasAuthStore(): boolean {
  return canAuthenticate();
}

export function getAuthChallenges() {
  if (hasDurableAuthStore()) {
    const config = requirePersistedConfig();
    const repositories = ensureDurableRepositories(config);
    if (!durableChallenges) {
      const persistence: ChallengePersistence = {
        async save(record) {
          await repositories.nonces.saveNonce({
            nonce: record.challenge.nonce,
            walletFingerprint: fingerprintWallet(
              record.challenge.walletAddress,
              config.walletHashPepper!,
            ),
            challenge: record.challenge,
            digest: record.digest,
            expiresAt: new Date(record.challenge.expiresAt),
          });
        },
        async get(nonce) {
          const record = await repositories.nonces.getNonce(nonce);
          return record ? { challenge: record.challenge, digest: record.digest, consumedAt: record.consumedAt } : undefined;
        },
        async consume(nonce, now) {
          const record = await repositories.nonces.consumeNonce(nonce, now);
          if (record === "REPLAYED") return "REPLAYED";
          return record ? { challenge: record.challenge, digest: record.digest } : undefined;
        },
      };
      durableChallenges = createAuthChallengeService({ persistence });
    }
    return durableChallenges;
  }
  return authChallenges;
}

export function getAuthRepositories() {
  return hasDurableAuthStore() ? ensureDurableRepositories(requirePersistedConfig()) : memoryRepositories;
}

function ensureDurableRepositories(config: ReturnType<typeof requirePersistedConfig>) {
  if (!durableRepositories) {
    durableRepositories = createPostgresRepositories(getDatabase(config.databaseUrl));
  }
  return durableRepositories;
}

export function getSessionSecret(): string {
  const configured = process.env.VEILAP_SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV !== "production") return developmentSecret;
  throw new Error("VEILAP_SESSION_SECRET_REQUIRED");
}

export function getWalletHashPepper(): string {
  const config = readServerConfig();
  if (config.walletHashPepper) return config.walletHashPepper;
  if (config.mode === "preview" && hasAuthStore()) return developmentSecret;
  throw new Error("VEILAP_WALLET_HASH_PEPPER_REQUIRED");
}

export function expectedOrigin(request: Request): string {
  const candidate = process.env.VEILAP_APP_ORIGIN ?? new URL(request.url).origin;
  const parsed = new URL(candidate);
  if (parsed.origin !== candidate) throw new Error("VEILAP_APP_ORIGIN_INVALID");
  const incoming = requestOrigin(request);
  if (readServerConfig().mode === "preview" && incoming && isLoopbackOrigin(parsed.origin) && isLoopbackOrigin(incoming)) {
    return incoming;
  }
  return parsed.origin;
}

export function requestOrigin(request: Request): string | undefined {
  const origin = request.headers.get("origin");
  if (!origin) return undefined;
  try {
    return new URL(origin).origin === origin ? origin : undefined;
  } catch {
    return undefined;
  }
}
