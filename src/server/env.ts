export type ServerMode = "preview" | "persisted";

export interface VeilapServerConfig {
  mode: ServerMode;
  databaseUrl?: string;
  starknetRpcUrl: string;
  sessionSecret?: string;
  walletHashPepper?: string;
  kmsKeyId?: string;
  awsRegion?: string;
  receiptSigningPrivateKey?: string;
  receiptSigningPublicKey?: string;
  arenaWorkerSecret?: string;
  arenaWorkerWalletAddress?: string;
  missing: string[];
}

const REQUIRED_PERSISTED_VARS = [
  "DATABASE_URL",
  "STARKNET_RPC_URL",
  "VEILAP_SESSION_SECRET",
  "VEILAP_WALLET_HASH_PEPPER",
  "VEILAP_KMS_KEY_ID",
  "AWS_REGION",
  "VEILAP_RECEIPT_SIGNING_PRIVATE_KEY",
  "VEILAP_RECEIPT_SIGNING_PUBLIC_KEY",
] as const;

function hasStrongSecret(value: string | undefined): boolean {
  return Boolean(value && value.length >= 64);
}

export function isLoopbackOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.origin === origin
      && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1");
  } catch {
    return false;
  }
}

export function readServerConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): VeilapServerConfig {
  const preview = env.NODE_ENV !== "production" && env.NEXT_PUBLIC_VEILAP_PREVIEW_MODE === "1";
  const missing = preview
    ? []
    : REQUIRED_PERSISTED_VARS.filter((name) => {
        const value = env[name];
        if (!value) return true;
        if ((name === "VEILAP_SESSION_SECRET" || name === "VEILAP_WALLET_HASH_PEPPER") && !hasStrongSecret(value)) {
          return true;
        }
        return false;
      });

  return {
    mode: preview ? "preview" : "persisted",
    databaseUrl: env.DATABASE_URL,
    starknetRpcUrl: env.STARKNET_RPC_URL ?? "",
    sessionSecret: env.VEILAP_SESSION_SECRET,
    walletHashPepper: env.VEILAP_WALLET_HASH_PEPPER,
    kmsKeyId: env.VEILAP_KMS_KEY_ID,
    awsRegion: env.AWS_REGION,
    receiptSigningPrivateKey: env.VEILAP_RECEIPT_SIGNING_PRIVATE_KEY,
    receiptSigningPublicKey: env.VEILAP_RECEIPT_SIGNING_PUBLIC_KEY,
    arenaWorkerSecret: env.VEILAP_ARENA_WORKER_SECRET,
    arenaWorkerWalletAddress: env.VEILAP_ARENA_WORKER_WALLET_ADDRESS,
    missing,
  };
}

export function requirePersistedConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): VeilapServerConfig {
  const config = readServerConfig(env);
  if (config.mode === "preview") return config;
  if (config.missing.length > 0) throw new Error("CONFIGURATION_MISSING");
  return config;
}

export function canAuthenticate(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const config = readServerConfig(env);
  if (config.mode === "preview") {
    if (env.NODE_ENV !== "production") return true;
    if (env.VEILAP_PREVIEW_AUTH !== "1" || !env.VEILAP_APP_ORIGIN) return false;
    return isLoopbackOrigin(env.VEILAP_APP_ORIGIN);
  }
  return config.missing.length === 0;
}
