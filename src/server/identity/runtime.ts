import { getDatabase } from "@/server/db/client";
import { readServerConfig, hasXOAuthConfig } from "@/server/env";
import { getSessionSecret, getWalletHashPepper } from "@/server/auth/runtime";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";
import {
  createMemoryXIdentityRepository,
  createPostgresXIdentityRepository,
  type XIdentityRepository,
} from "./x-identity-repository";
import type { XOAuthConfig } from "./x-oauth-client";

const memoryRepository = createMemoryXIdentityRepository();
let durableRepository: XIdentityRepository | undefined;

export const X_OAUTH_COOKIE = process.env.NODE_ENV === "production"
  ? "__Host-veilap_x_oauth"
  : "veilap_x_oauth";

export function getXOAuthConfig(): XOAuthConfig {
  if (!hasXOAuthConfig()) throw new Error("X_VERIFICATION_UNAVAILABLE");
  return {
    clientId: process.env.X_OAUTH_CLIENT_ID!.trim(),
    clientSecret: process.env.X_OAUTH_CLIENT_SECRET!.trim(),
    redirectUri: process.env.X_OAUTH_REDIRECT_URI!.trim(),
  };
}

export function getXIdentityRepository(): XIdentityRepository {
  const config = readServerConfig();
  if (config.mode === "preview") return memoryRepository;
  if (config.missing.length > 0 || !config.databaseUrl) throw new Error("CONFIGURATION_MISSING");
  durableRepository ??= createPostgresXIdentityRepository(getDatabase(config.databaseUrl));
  return durableRepository;
}

export function walletFingerprint(walletAddress: string): string {
  return fingerprintWallet(walletAddress, getWalletHashPepper());
}

export function xFlowSecret(): string {
  return getSessionSecret();
}
