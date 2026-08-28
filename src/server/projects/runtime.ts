import { KmsKeyProvider } from "@/server/crypto/kms-key-provider";
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
import { ProjectService } from "./project-service";

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
  };
}

export function getProjectService(): ProjectService {
  return new ProjectService(dependencies());
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
