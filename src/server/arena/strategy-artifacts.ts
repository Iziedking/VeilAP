import { randomUUID } from "node:crypto";

import { decryptField, encryptField, type EncryptedField } from "@/server/crypto/envelope";
import type { ProjectKeyMaterial } from "@/server/crypto/key-provider";
import type { ProjectRepository } from "@/server/db/repositories";
import { normalizeFeltAddress } from "@/lib/strk20/address";
import {
  compileStrategyAgent,
  parseStrategyPolicy,
  strategyArtifactCommitment,
  type StrategyPolicy,
} from "@/domain/arena/strategy-policy";

const RECORD_TYPE = "arena_strategy_artifact";

export type StrategyArtifactRecord = Readonly<{
  id: string;
  projectId: string;
  agentId: string;
  displayName: string;
  artifactCommitment: string;
  encryptedPolicy: EncryptedField;
  ownerFingerprint?: string;
  encryptedOwnerWallet?: EncryptedField;
  status: "sealed";
  createdAt: Date;
}>;

export interface StrategyArtifactStore {
  save(record: StrategyArtifactRecord): Promise<void>;
  get(projectId: string, agentId: string): Promise<StrategyArtifactRecord | undefined>;
}

export function createRepositoryStrategyArtifactStore(
  repository: Pick<ProjectRepository, "saveArenaStrategyArtifact" | "getArenaStrategyArtifact">,
): StrategyArtifactStore {
  return {
    async save(record) {
      await repository.saveArenaStrategyArtifact({ ...record });
    },
    get(projectId, agentId) {
      return repository.getArenaStrategyArtifact(projectId, agentId);
    },
  };
}

export function createMemoryStrategyArtifactStore(): StrategyArtifactStore {
  const records = new Map<string, StrategyArtifactRecord>();
  return {
    async save(record) {
      const key = `${record.projectId}:${record.agentId}`;
      if (records.has(key)) throw new Error("STRATEGY_ARTIFACT_ALREADY_EXISTS");
      records.set(key, structuredClone(record));
    },
    async get(projectId, agentId) {
      const record = records.get(`${projectId}:${agentId}`);
      return record ? structuredClone(record) : undefined;
    },
  };
}

function contextFor(
  record: Pick<StrategyArtifactRecord, "projectId" | "id">,
  fieldName: "policy" | "owner_wallet",
) {
  return {
    projectId: record.projectId,
    recordType: RECORD_TYPE,
    recordId: record.id,
    fieldName,
  } as const;
}

export function buildStrategyArtifact(input: {
  projectId: string;
  agentId: string;
  policy: unknown;
  keyMaterial: ProjectKeyMaterial;
  ownerFingerprint?: string;
  ownerWalletAddress?: string;
  now?: () => Date;
  idFactory?: () => string;
}): StrategyArtifactRecord {
  const projectId = input.projectId.trim();
  const agentId = input.agentId.trim();
  if (projectId.length < 1 || agentId.length < 1 || agentId.length > 80) {
    throw new Error("STRATEGY_ARTIFACT_ID_INVALID");
  }
  const policy = parseStrategyPolicy(input.policy);
  const id = input.idFactory?.() ?? randomUUID();
  const encryptedPolicy = encryptField(
    JSON.stringify(policy),
    contextFor({ projectId, id }, "policy"),
    input.keyMaterial,
  );
  const ownerWalletAddress = input.ownerWalletAddress
    ? normalizeFeltAddress(input.ownerWalletAddress)
    : undefined;
  if ((input.ownerFingerprint && !ownerWalletAddress) || (!input.ownerFingerprint && ownerWalletAddress)) {
    throw new Error("STRATEGY_OWNER_INVALID");
  }
  const record: StrategyArtifactRecord = {
    id,
    projectId,
    agentId,
    displayName: policy.displayName,
    artifactCommitment: strategyArtifactCommitment(policy),
    encryptedPolicy,
    ownerFingerprint: input.ownerFingerprint,
    encryptedOwnerWallet: ownerWalletAddress
      ? encryptField(
        ownerWalletAddress,
        contextFor({ projectId, id }, "owner_wallet"),
        input.keyMaterial,
      )
      : undefined,
    status: "sealed",
    createdAt: input.now?.() ?? new Date(),
  };
  return record;
}

export async function submitStrategyArtifact(input: {
  projectId: string;
  agentId: string;
  policy: unknown;
  keyMaterial: ProjectKeyMaterial;
  store: StrategyArtifactStore;
  ownerFingerprint?: string;
  ownerWalletAddress?: string;
  now?: () => Date;
  idFactory?: () => string;
}): Promise<StrategyArtifactRecord> {
  const record = buildStrategyArtifact(input);
  await input.store.save(record);
  return record;
}

export async function openStrategyArtifact(input: {
  record: StrategyArtifactRecord;
  keyMaterial: ProjectKeyMaterial;
}): Promise<{ policy: StrategyPolicy; agent: ReturnType<typeof compileStrategyAgent> }> {
  const plaintext = decryptField(
    input.record.encryptedPolicy,
    contextFor(input.record, "policy"),
    input.keyMaterial,
  );
  let policy: StrategyPolicy;
  try {
    policy = parseStrategyPolicy(JSON.parse(plaintext));
  } catch {
    throw new Error("STRATEGY_ARTIFACT_INVALID");
  }
  if (strategyArtifactCommitment(policy) !== input.record.artifactCommitment) {
    throw new Error("STRATEGY_ARTIFACT_COMMITMENT_MISMATCH");
  }
  return {
    policy,
    agent: compileStrategyAgent(input.record.agentId, policy),
  };
}

export function openStrategyOwnerWallet(input: {
  record: StrategyArtifactRecord;
  keyMaterial: ProjectKeyMaterial;
}): string | undefined {
  if (!input.record.encryptedOwnerWallet) return undefined;
  return normalizeFeltAddress(decryptField(
    input.record.encryptedOwnerWallet,
    contextFor(input.record, "owner_wallet"),
    input.keyMaterial,
  ));
}
