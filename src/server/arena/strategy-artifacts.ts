import { randomUUID } from "node:crypto";

import { decryptField, encryptField, type EncryptedField } from "@/server/crypto/envelope";
import type { ProjectKeyMaterial } from "@/server/crypto/key-provider";
import type { ProjectRepository } from "@/server/db/repositories";
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

function contextFor(record: Pick<StrategyArtifactRecord, "projectId" | "id">) {
  return {
    projectId: record.projectId,
    recordType: RECORD_TYPE,
    recordId: record.id,
    fieldName: "policy",
  } as const;
}

export async function submitStrategyArtifact(input: {
  projectId: string;
  agentId: string;
  policy: unknown;
  keyMaterial: ProjectKeyMaterial;
  store: StrategyArtifactStore;
  now?: () => Date;
  idFactory?: () => string;
}): Promise<StrategyArtifactRecord> {
  const projectId = input.projectId.trim();
  const agentId = input.agentId.trim();
  if (projectId.length < 1 || agentId.length < 1 || agentId.length > 80) {
    throw new Error("STRATEGY_ARTIFACT_ID_INVALID");
  }
  const policy = parseStrategyPolicy(input.policy);
  const id = input.idFactory?.() ?? randomUUID();
  const encryptedPolicy = encryptField(
    JSON.stringify(policy),
    contextFor({ projectId, id }),
    input.keyMaterial,
  );
  const record: StrategyArtifactRecord = {
    id,
    projectId,
    agentId,
    displayName: policy.displayName,
    artifactCommitment: strategyArtifactCommitment(policy),
    encryptedPolicy,
    status: "sealed",
    createdAt: input.now?.() ?? new Date(),
  };
  await input.store.save(record);
  return record;
}

export async function openStrategyArtifact(input: {
  record: StrategyArtifactRecord;
  keyMaterial: ProjectKeyMaterial;
}): Promise<{ policy: StrategyPolicy; agent: ReturnType<typeof compileStrategyAgent> }> {
  const plaintext = decryptField(
    input.record.encryptedPolicy,
    contextFor(input.record),
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
