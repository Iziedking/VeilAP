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

export function participantAgentView(record: ParticipantAgentPackageRecord): ParticipantAgentView {
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
    vaultKeys?: { currentKeyId: string; keys: Readonly<Record<string, string>>; legacySessionSecrets?: readonly string[] };
    now?: () => Date;
    idFactory?: () => string;
  }) {}

  private seal(plaintext: string, id: string): ParticipantAgentPackageRecord["encryptedPackage"] {
    const ring = this.dependencies.vaultKeys;
    if (!ring) throw new Error("PARTICIPANT_VAULT_KEY_REQUIRED");
    const key = ring.keys[ring.currentKeyId];
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(ring.currentKeyId) || !key || !/^[a-f0-9]{64}$/i.test(key)) throw new Error("PARTICIPANT_VAULT_KEY_INVALID");
    return { ...encryptField(plaintext, context(id), Buffer.from(key, "hex")), keyId: ring.currentKeyId };
  }

  private decrypt(record: ParticipantAgentPackageRecord): AgentPackage {
    const ring = this.dependencies.vaultKeys;
    const keyId = record.encryptedPackage.keyId;
    const keys = keyId
      ? (ring?.keys[keyId] ? [Buffer.from(ring.keys[keyId], "hex")] : [])
      : [this.dependencies.sessionSecret, ...(ring?.legacySessionSecrets ?? [])].map(vaultKey);
    for (const key of keys) {
      try { return parseAgentPackage(JSON.parse(decryptField(record.encryptedPackage, context(record.id), key))); }
      catch { /* Try retained legacy keys; never change a record on failed decryption. */ }
    }
    throw new Error("PARTICIPANT_AGENT_PACKAGE_INVALID");
  }

  async rewrap(input: { actorWalletAddress: string; agentId: string }): Promise<ParticipantAgentView> {
    const owner = fingerprintWallet(input.actorWalletAddress, this.dependencies.walletHashPepper);
    const record = await this.dependencies.repositories.updateParticipantAgentPackage(owner, input.agentId.trim().toUpperCase(), (existing) => {
      if (!existing) throw new Error("PARTICIPANT_AGENT_NOT_FOUND");
      const plaintext = this.decrypt(existing);
      if (agentPackageCommitment(plaintext) !== existing.artifactCommitment) throw new Error("PARTICIPANT_AGENT_COMMITMENT_MISMATCH");
      return { ...existing, encryptedPackage: this.seal(JSON.stringify(plaintext), existing.id) };
    });
    return participantAgentView(record);
  }

  async list(actorWalletAddress: string): Promise<ParticipantAgentView[]> {
    const ownerFingerprint = fingerprintWallet(actorWalletAddress, this.dependencies.walletHashPepper);
    const records = await this.dependencies.repositories.listParticipantAgentPackages(ownerFingerprint);
    return records.map(participantAgentView);
  }

  async save(input: { actorWalletAddress: string; agentPackage: unknown }): Promise<ParticipantAgentView> {
    const agentPackage = parseAgentPackage(input.agentPackage);
    const ownerFingerprint = fingerprintWallet(input.actorWalletAddress, this.dependencies.walletHashPepper);
    const record = await this.dependencies.repositories.updateParticipantAgentPackage(ownerFingerprint, agentPackage.agentId, (existing) => {
      return this.buildRecord(ownerFingerprint, agentPackage, existing);
    });
    return participantAgentView(record);
  }

  // Synchronous builder also used inside atomic draft finalization.
  buildRecord(ownerFingerprint: string, agentPackage: AgentPackage, existing?: ParticipantAgentPackageRecord): ParticipantAgentPackageRecord {
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
      encryptedPackage: this.seal(JSON.stringify(agentPackage), id),
      version: (existing?.version ?? 0) + (existing?.artifactCommitment === agentPackageCommitment(agentPackage) ? 0 : 1),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    return record;
  }

  async open(input: { actorWalletAddress: string; agentId: string }): Promise<{ view: ParticipantAgentView; agentPackage: AgentPackage } | null> {
    const ownerFingerprint = fingerprintWallet(input.actorWalletAddress, this.dependencies.walletHashPepper);
    const record = await this.dependencies.repositories.getParticipantAgentPackage(ownerFingerprint, input.agentId.trim().toUpperCase());
    if (!record) return null;
    let agentPackage: AgentPackage;
    try {
      agentPackage = this.decrypt(record);
    } catch {
      throw new Error("PARTICIPANT_AGENT_PACKAGE_INVALID");
    }
    if (agentPackageCommitment(agentPackage) !== record.artifactCommitment) {
      throw new Error("PARTICIPANT_AGENT_COMMITMENT_MISMATCH");
    }
    return { view: participantAgentView(record), agentPackage };
  }
}
