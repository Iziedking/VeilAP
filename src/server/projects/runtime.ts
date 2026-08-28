import { KmsKeyProvider } from "@/server/crypto/kms-key-provider";
import { createPreviewKeyProvider } from "@/server/crypto/preview-key-provider";
import { getAuthRepositories } from "@/server/auth/runtime";
import { readServerConfig, requirePersistedConfig } from "@/server/env";
import { CheckpointService } from "@/server/checkpoints/checkpoint-service";
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
