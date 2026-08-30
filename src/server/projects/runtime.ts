import { checkKmsKeyAccess, KmsKeyProvider } from "@/server/crypto/kms-key-provider";
import { createPreviewKeyProvider } from "@/server/crypto/preview-key-provider";
import { RpcProvider } from "starknet";
import { getAuthRepositories } from "@/server/auth/runtime";
import { readServerConfig, requirePersistedConfig } from "@/server/env";
import { CheckpointService } from "@/server/checkpoints/checkpoint-service";
import { VerificationService } from "@/server/verification/verification-service";
import { createNoopModelAdapter } from "@/server/verification/model-adapter";
import { DecisionService } from "@/server/decisions/decision-service";
import { ReleaseService } from "@/server/releases/release-service";
import { ReconciliationService } from "@/server/releases/reconciliation-service";
import { createMainnetReceiptProvider } from "@/server/strk20/rpc-receipt-provider";
import { ReceiptService } from "@/server/receipts/receipt-service";
import { createReceiptSigner } from "@/server/receipts/signing";
import { ProjectService } from "./project-service";
import { StrategyService } from "@/server/arena/strategy-service";
import { ArenaMatchService } from "@/server/arena/arena-match-service";
import { ArenaSeasonService } from "@/server/arena/arena-season-service";
import { ArenaEnrollmentService } from "@/server/arena/arena-enrollment-service";
import { ArenaPrizePoolService } from "@/server/arena/arena-prize-pool-service";
import { ArenaWorkerService } from "@/server/arena/arena-worker-service";
import { ArenaReadinessService } from "@/server/arena/arena-readiness-service";
import { checkArenaDatabaseReadiness } from "@/server/arena/arena-readiness-database";

const previewKeyProvider = createPreviewKeyProvider();
let persistedKeyProvider: KmsKeyProvider | undefined;

function projectKeyProvider() {
  const config = readServerConfig();
  if (config.mode === "preview") return previewKeyProvider;
  const persisted = requirePersistedConfig();
  if (!persistedKeyProvider) {
    persistedKeyProvider = new KmsKeyProvider({
      keyId: persisted.kmsKeyId!,
      region: persisted.awsRegion!,
    });
  }
  return persistedKeyProvider;
}

function dependencies() {
  const config = readServerConfig();
  return {
    repositories: getAuthRepositories().projects,
    keyProvider: projectKeyProvider(),
    walletHashPepper: config.walletHashPepper ?? "veilap-preview-wallet-pepper-0123456789012345",
    signer: config.receiptSigningPrivateKey && config.receiptSigningPublicKey
      ? createReceiptSigner({
        privateKeyBase64: config.receiptSigningPrivateKey,
        publicKeyBase64: config.receiptSigningPublicKey,
      })
      : undefined,
  };
}

export function getProjectService(): ProjectService {
  return new ProjectService(dependencies());
}

export function getStrategyService(): StrategyService {
  return new StrategyService(dependencies());
}

export function getArenaMatchService(): ArenaMatchService {
  return new ArenaMatchService(dependencies());
}

export function getArenaSeasonService(): ArenaSeasonService {
  return new ArenaSeasonService({
    ...dependencies(),
    matchService: getArenaMatchService(),
  });
}

export function getArenaEnrollmentService(): ArenaEnrollmentService {
  return new ArenaEnrollmentService(dependencies());
}

export function getArenaPrizePoolService(): ArenaPrizePoolService {
  const config = requirePersistedConfig();
  const poolAddress = process.env.NEXT_PUBLIC_STRK20_POOL_ADDRESS;
  if (!poolAddress) throw new Error("STRK20_POOL_NOT_CONFIGURED");
  const provider = new RpcProvider({ nodeUrl: config.starknetRpcUrl });
  return new ArenaPrizePoolService({
    ...dependencies(),
    receiptProvider: createMainnetReceiptProvider(config.starknetRpcUrl),
    poolAddress,
    verifySignature: (typedData, signature, walletAddress) =>
      provider.verifyMessageInStarknet(typedData, signature, walletAddress),
  });
}

export function getArenaWorkerService(): ArenaWorkerService {
  const config = requirePersistedConfig();
  if (!config.arenaWorkerWalletAddress) throw new Error("WORKER_NOT_CONFIGURED");
  return new ArenaWorkerService({
    repositories: getAuthRepositories().projects,
    seasonService: getArenaSeasonService(),
    workerWalletAddress: config.arenaWorkerWalletAddress,
  });
}

export function getArenaReadinessService(): ArenaReadinessService {
  const config = readServerConfig();
  return new ArenaReadinessService({
    config,
    poolAddress: process.env.NEXT_PUBLIC_STRK20_POOL_ADDRESS,
    checkKms: async () => {
      if (!config.kmsKeyId || !config.awsRegion) return false;
      return checkKmsKeyAccess({ keyId: config.kmsKeyId, region: config.awsRegion });
    },
    checkReceiptSigning: () => {
      if (!config.receiptSigningPrivateKey || !config.receiptSigningPublicKey) return false;
      try {
        createReceiptSigner({
          privateKeyBase64: config.receiptSigningPrivateKey,
          publicKeyBase64: config.receiptSigningPublicKey,
        });
        return true;
      } catch {
        return false;
      }
    },
    checkDatabase: () => checkArenaDatabaseReadiness(config.databaseUrl),
  });
}

export function getCheckpointService(): CheckpointService {
  return new CheckpointService(dependencies());
}

export function getVerificationService(): VerificationService {
  return new VerificationService({
    ...dependencies(),
    modelAdapter: createNoopModelAdapter(),
  });
}

export function getDecisionService(): DecisionService {
  const config = requirePersistedConfig();
  // starknet@10.4.0 RpcProvider.verifyMessageInStarknet, read 2026-08-28.
  const provider = new RpcProvider({ nodeUrl: config.starknetRpcUrl });
  return new DecisionService({
    ...dependencies(),
    verifySignature: (typedData, signature, walletAddress) =>
      provider.verifyMessageInStarknet(typedData, signature, walletAddress),
  });
}

export function getReleaseService(): ReleaseService {
  requirePersistedConfig();
  return new ReleaseService(dependencies());
}

export function getReconciliationService(): ReconciliationService {
  const config = requirePersistedConfig();
  const poolAddress = process.env.NEXT_PUBLIC_STRK20_POOL_ADDRESS;
  if (!poolAddress) throw new Error("STRK20_POOL_NOT_CONFIGURED");
  return new ReconciliationService({
    repositories: getAuthRepositories().projects,
    receiptProvider: createMainnetReceiptProvider(config.starknetRpcUrl),
    walletHashPepper: config.walletHashPepper!,
    poolAddress,
  });
}

function getReceiptSigner() {
  const config = requirePersistedConfig();
  if (!config.receiptSigningPrivateKey || !config.receiptSigningPublicKey) throw new Error("CONFIGURATION_MISSING");
  return createReceiptSigner({
    privateKeyBase64: config.receiptSigningPrivateKey,
    publicKeyBase64: config.receiptSigningPublicKey,
  });
}

export function getReceiptService(): ReceiptService {
  return new ReceiptService({
    ...dependencies(),
    signer: getReceiptSigner(),
  });
}

export function getReceiptPublicKey() {
  return getReceiptSigner().publicKey();
}
