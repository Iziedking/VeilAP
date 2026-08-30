import { randomUUID } from "node:crypto";

import { commitment } from "@/domain/canonical";
import { authorizeProject } from "@/server/authorization/authorize";
import type { ProjectRepository, ProjectRole } from "@/server/db/repositories";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";
import type { KeyProvider } from "@/server/crypto/key-provider";

import {
  createRepositoryStrategyArtifactStore,
  submitStrategyArtifact,
  type StrategyArtifactRecord,
} from "./strategy-artifacts";

export type StrategyServiceErrorCode =
  | "INVALID_INPUT"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_ACCESS_REQUIRED"
  | "ROLE_FORBIDDEN"
  | "STRATEGY_ARTIFACT_ALREADY_EXISTS"
  | "ENCRYPTION_FAILED"
  | "PERSISTENCE_FAILED";

export type StrategyServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: StrategyServiceErrorCode };

export interface StrategyArtifactView {
  id: string;
  projectId: string;
  agentId: string;
  displayName: string;
  artifactCommitment: string;
  status: "sealed";
  createdAt: string;
}

export interface StrategyServiceDependencies {
  repositories: ProjectRepository;
  keyProvider: KeyProvider;
  walletHashPepper: string;
  now?: () => Date;
  idFactory?: () => string;
}

function mapAuthorizationCode(code: string): StrategyServiceErrorCode {
  return code === "PROJECT_ACCESS_REQUIRED" ? "PROJECT_ACCESS_REQUIRED" : "ROLE_FORBIDDEN";
}

function mapError(error: unknown): StrategyServiceErrorCode {
  if (!(error instanceof Error)) return "PERSISTENCE_FAILED";
  if (
    error.message === "STRATEGY_ARTIFACT_ALREADY_EXISTS"
    || error.message === "STRATEGY_ARTIFACT_COMMITMENT_ALREADY_EXISTS"
    || error.message === "ARENA_ARTIFACT_ALREADY_EXISTS"
    || error.message === "ARENA_ARTIFACT_COMMITMENT_ALREADY_EXISTS"
  ) {
    return "STRATEGY_ARTIFACT_ALREADY_EXISTS";
  }
  if (error.message === "STRATEGY_POLICY_INVALID" || error.message === "STRATEGY_ARTIFACT_ID_INVALID") {
    return "INVALID_INPUT";
  }
  if (error.message.includes("ENVELOPE_") || error.message.includes("KEY_")) return "ENCRYPTION_FAILED";
  return "PERSISTENCE_FAILED";
}

export class StrategyService {
  private readonly repositories: ProjectRepository;
  private readonly keyProvider: KeyProvider;
  private readonly walletHashPepper: string;
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(dependencies: StrategyServiceDependencies) {
    this.repositories = dependencies.repositories;
    this.keyProvider = dependencies.keyProvider;
    this.walletHashPepper = dependencies.walletHashPepper;
    this.now = dependencies.now ?? (() => new Date());
    this.idFactory = dependencies.idFactory ?? randomUUID;
  }

  async submitStrategy(input: {
    projectId: string;
    actorWalletAddress: string;
    agentId: string;
    policy: unknown;
  }): Promise<StrategyServiceResult<StrategyArtifactView>> {
    const projectId = input.projectId.trim();
    if (!projectId || !input.agentId.trim()) return { ok: false, code: "INVALID_INPUT" };

    try {
      const project = await this.repositories.getProject(projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const actorFingerprint = fingerprintWallet(input.actorWalletAddress, this.walletHashPepper);
      const authorized = await authorizeProject(this.repositories, {
        projectId,
        walletFingerprint: actorFingerprint,
        action: "submit_strategy",
      });
      if (!authorized.ok) return { ok: false, code: mapAuthorizationCode(authorized.code) };

      const dataKey = await this.keyProvider.unwrap(project.wrappedDataKey, projectId);
      const record = await submitStrategyArtifact({
        projectId,
        agentId: input.agentId,
        policy: input.policy,
        keyMaterial: { dataKey, wrappedKey: project.wrappedDataKey },
        ownerFingerprint: actorFingerprint,
        ownerWalletAddress: input.actorWalletAddress,
        store: createRepositoryStrategyArtifactStore(this.repositories),
        now: this.now,
        idFactory: this.idFactory,
      });
      await this.repositories.saveAuditEvent({
        id: this.idFactory(),
        projectId,
        actorFingerprint,
        eventType: "strategy_artifact_submitted",
        payloadDigest: commitment({
          agentId: record.agentId,
          artifactCommitment: record.artifactCommitment,
          artifactId: record.id,
        }),
        createdAt: this.now(),
      });
      return { ok: true, value: this.view(record) };
    } catch (error) {
      return { ok: false, code: mapError(error) };
    }
  }

  async listStrategies(input: {
    projectId: string;
    actorWalletAddress: string;
  }): Promise<StrategyServiceResult<StrategyArtifactView[]>> {
    const projectId = input.projectId.trim();
    if (!projectId) return { ok: false, code: "INVALID_INPUT" };

    try {
      const project = await this.repositories.getProject(projectId);
      if (!project) return { ok: false, code: "PROJECT_NOT_FOUND" };
      const actorFingerprint = fingerprintWallet(input.actorWalletAddress, this.walletHashPepper);
      const authorized = await authorizeProject(this.repositories, {
        projectId,
        walletFingerprint: actorFingerprint,
        action: "read_project",
      });
      if (!authorized.ok) return { ok: false, code: mapAuthorizationCode(authorized.code) };
      const records = await this.repositories.listArenaStrategyArtifacts(projectId);
      return { ok: true, value: records.map((record) => this.view(record)) };
    } catch {
      return { ok: false, code: "PERSISTENCE_FAILED" };
    }
  }

  private view(record: StrategyArtifactRecord): StrategyArtifactView {
    return {
      id: record.id,
      projectId: record.projectId,
      agentId: record.agentId,
      displayName: record.displayName,
      artifactCommitment: record.artifactCommitment,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
    };
  }
}

export type StrategyProjectRoles = ProjectRole[];
