import { createHash, randomUUID } from "node:crypto";

import {
  agentPackageCommitment,
  parseAgentPackage,
  type AgentPackage,
} from "@/domain/arena/strategy-policy";
import { decryptField, encryptField } from "@/server/crypto/envelope";
import type { ParticipantAgentPackageRecord, ProjectRepository } from "@/server/db/repositories";
import { fingerprintWallet } from "@/server/privacy/wallet-fingerprint";

const VAULT_PROJECT = "participant-agent-vault";
const RECORD_TYPE = "participant_agent_package";

export type ParticipantAgentView = Readonly<{
  id: string;
  agentId: string;
  displayName: string;
  protocolVersion: string;
  engineVersion: string;
  ruleCount: number;
  artifactCommitment: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}>;

function vaultKey(secret: string): Uint8Array {
  return createHash("sha256").update("veilap:participant-agent-vault:v1:").update(secret).digest();
}

function context(recordId: string) {
  return {
    projectId: VAULT_PROJECT,
    recordType: RECORD_TYPE,
    recordId,
    fieldName: "package",
  } as const;
}

function view(record: ParticipantAgentPackageRecord): ParticipantAgentView {
  return {
    id: record.id,
    agentId: record.agentId,
    displayName: record.displayName,
    protocolVersion: record.protocolVersion,
    engineVersion: record.engineVersion,
    ruleCount: record.ruleCount,
    artifactCommitment: record.artifactCommitment,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export class ParticipantAgentService {
  constructor(private readonly dependencies: {
    repositories: ProjectRepository;
    walletHashPepper: string;
    sessionSecret: string;
    now?: () => Date;
    idFactory?: () => string;
  }) {}

  async list(actorWalletAddress: string): Promise<ParticipantAgentView[]> {
    const ownerFingerprint = fingerprintWallet(actorWalletAddress, this.dependencies.walletHashPepper);
    const records = await this.dependencies.repositories.listParticipantAgentPackages(ownerFingerprint);
    return records.map(view);
  }

  async save(input: { actorWalletAddress: string; agentPackage: unknown }): Promise<ParticipantAgentView> {
    const agentPackage = parseAgentPackage(input.agentPackage);
    const ownerFingerprint = fingerprintWallet(input.actorWalletAddress, this.dependencies.walletHashPepper);
    const existing = await this.dependencies.repositories.getParticipantAgentPackage(ownerFingerprint, agentPackage.agentId);
    const now = this.dependencies.now?.() ?? new Date();
    const id = existing?.id ?? this.dependencies.idFactory?.() ?? randomUUID();
    const record: ParticipantAgentPackageRecord = {
      id,
      ownerFingerprint,
      agentId: agentPackage.agentId,
      displayName: agentPackage.displayName,
      protocolVersion: agentPackage.protocolVersion,
      engineVersion: agentPackage.engineVersion,
      ruleCount: agentPackage.policy.rules.length,
      artifactCommitment: agentPackageCommitment(agentPackage),
      encryptedPackage: encryptField(
        JSON.stringify(agentPackage),
        context(id),
        vaultKey(this.dependencies.sessionSecret),
      ),
      version: (existing?.version ?? 0) + (existing?.artifactCommitment === agentPackageCommitment(agentPackage) ? 0 : 1),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.dependencies.repositories.saveParticipantAgentPackage(record);
    return view(record);
  }

  async open(input: { actorWalletAddress: string; agentId: string }): Promise<{ view: ParticipantAgentView; agentPackage: AgentPackage } | null> {
    const ownerFingerprint = fingerprintWallet(input.actorWalletAddress, this.dependencies.walletHashPepper);
    const record = await this.dependencies.repositories.getParticipantAgentPackage(ownerFingerprint, input.agentId.trim().toUpperCase());
    if (!record) return null;
    let agentPackage: AgentPackage;
    try {
      agentPackage = parseAgentPackage(JSON.parse(decryptField(
        record.encryptedPackage,
        context(record.id),
        vaultKey(this.dependencies.sessionSecret),
      )));
    } catch {
      throw new Error("PARTICIPANT_AGENT_PACKAGE_INVALID");
    }
    if (agentPackageCommitment(agentPackage) !== record.artifactCommitment) {
      throw new Error("PARTICIPANT_AGENT_COMMITMENT_MISMATCH");
    }
    return { view: view(record), agentPackage };
  }
}
