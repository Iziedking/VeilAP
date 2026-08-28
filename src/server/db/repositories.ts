import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";

import type { AuthChallenge } from "@/server/auth/challenge";
import type { EncryptedField } from "@/server/crypto/envelope";
import type { VeilapDatabase } from "./client";
import {
  agreementVersions,
  auditEvents,
  authNonces,
  authSessions,
  checkpoints,
  projectMembers,
  projects,
} from "./schema";

export interface AuthNonceRecord {
  nonce: string;
  walletFingerprint: string;
  challenge: AuthChallenge;
  digest: string;
  expiresAt: Date;
  consumedAt?: Date;
}

export interface AuthNonceRepository {
  saveNonce(record: AuthNonceRecord): Promise<void>;
  getNonce(nonce: string): Promise<AuthNonceRecord | undefined>;
  consumeNonce(nonce: string, now: Date): Promise<AuthNonceRecord | "REPLAYED" | undefined>;
}

export interface SessionRecord {
  id: string;
  walletFingerprint: string;
  issuedAt: Date;
  expiresAt: Date;
}

export interface SessionRepository {
  saveSession(record: SessionRecord): Promise<void>;
  revokeSession(id: string, now: Date): Promise<void>;
}

export interface ProjectKeyRecord {
  id: string;
  name: string;
  ownerFingerprint: string;
  wrappedDataKey: string;
  createdAt: Date;
}

export interface ProjectKeyRepository {
  saveProject(record: ProjectKeyRecord): Promise<void>;
  getProject(id: string): Promise<ProjectKeyRecord | undefined>;
}

export type ProjectRole = "company" | "contributor" | "reviewer" | "auditor";

export interface ProjectMemberRecord {
  projectId: string;
  walletFingerprint: string;
  role: ProjectRole;
  createdAt: Date;
}

export interface AgreementVersionRecord {
  id: string;
  projectId: string;
  version: number;
  encryptedTerms: EncryptedField;
  termsDigest: string;
  createdBy: string;
  createdAt: Date;
}

export interface EncryptedCheckpointPayload {
  artifact: EncryptedField;
  metadata: EncryptedField;
}

export interface CheckpointRecord {
  id: string;
  projectId: string;
  agreementVersionId: string;
  sequence: number;
  encryptedPayload: EncryptedCheckpointPayload;
  payloadDigest: string;
  status: "submitted" | "verified" | "rejected";
  createdBy: string;
  assignedReviewerFingerprint?: string;
  createdAt: Date;
}

export interface AuditEventRecord {
  id: string;
  projectId: string;
  actorFingerprint: string;
  eventType: string;
  payloadDigest: string;
  createdAt: Date;
}

export interface ProjectRepository extends ProjectKeyRepository {
  saveMember(record: ProjectMemberRecord): Promise<void>;
  getMemberRoles(projectId: string, walletFingerprint: string): Promise<ProjectRole[]>;
  saveAgreement(record: AgreementVersionRecord): Promise<void>;
  getAgreement(projectId: string, version: number): Promise<AgreementVersionRecord | undefined>;
  listAgreements(projectId: string): Promise<AgreementVersionRecord[]>;
  saveCheckpoint(record: CheckpointRecord): Promise<void>;
  getCheckpoint(id: string): Promise<CheckpointRecord | undefined>;
  listCheckpoints(projectId: string): Promise<CheckpointRecord[]>;
  saveAuditEvent(record: AuditEventRecord): Promise<void>;
}

function projectRole(value: string): ProjectRole {
  if (value === "company" || value === "contributor" || value === "reviewer" || value === "auditor") {
    return value;
  }
  throw new Error("PROJECT_ROLE_INVALID");
}

function toNonceRecord(row: typeof authNonces.$inferSelect): AuthNonceRecord {
  return {
    nonce: row.nonce,
    walletFingerprint: row.walletFingerprint,
    challenge: row.challenge as AuthChallenge,
    digest: row.digest,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt ?? undefined,
  };
}

function toAgreementRecord(row: typeof agreementVersions.$inferSelect): AgreementVersionRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    version: row.version,
    encryptedTerms: row.encryptedTerms as EncryptedField,
    termsDigest: row.termsDigest,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function toCheckpointRecord(row: typeof checkpoints.$inferSelect): CheckpointRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    agreementVersionId: row.agreementVersionId,
    sequence: row.sequence,
    encryptedPayload: row.encryptedPayload as EncryptedCheckpointPayload,
    payloadDigest: row.payloadDigest,
    status: row.status as CheckpointRecord["status"],
    createdBy: row.createdBy,
    assignedReviewerFingerprint: row.assignedReviewerFingerprint ?? undefined,
    createdAt: row.createdAt,
  };
}

export function createPostgresRepositories(db: VeilapDatabase): {
  nonces: AuthNonceRepository;
  sessions: SessionRepository;
  projects: ProjectRepository;
} {
  return {
    nonces: {
      async saveNonce(record) {
        await db.insert(authNonces).values({
          nonce: record.nonce,
          walletFingerprint: record.walletFingerprint,
          challenge: record.challenge,
          digest: record.digest,
          expiresAt: record.expiresAt,
          consumedAt: record.consumedAt,
        });
      },
      async getNonce(nonce) {
        const rows = await db.select().from(authNonces).where(eq(authNonces.nonce, nonce)).limit(1);
        return rows[0] ? toNonceRecord(rows[0]) : undefined;
      },
      async consumeNonce(nonce, now) {
        const rows = await db
          .update(authNonces)
          .set({ consumedAt: now })
          .where(
            and(
              eq(authNonces.nonce, nonce),
              isNull(authNonces.consumedAt),
              gt(authNonces.expiresAt, now),
            ),
          )
          .returning();
        if (rows[0]) return toNonceRecord(rows[0]);
        const existing = await this.getNonce(nonce);
        return existing?.consumedAt ? "REPLAYED" : undefined;
      },
    },
    sessions: {
      async saveSession(record) {
        await db.insert(authSessions).values(record);
      },
      async revokeSession(id, now) {
        await db
          .update(authSessions)
          .set({ revokedAt: now })
          .where(and(eq(authSessions.id, id), isNull(authSessions.revokedAt)));
      },
    },
    projects: {
      async saveProject(record) {
        await db.insert(projects).values(record);
      },
      async getProject(id) {
        const rows = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
        return rows[0];
      },
      async saveMember(record) {
        await db.insert(projectMembers).values(record);
      },
      async getMemberRoles(projectId, walletFingerprint) {
        const rows = await db
          .select({ role: projectMembers.role })
          .from(projectMembers)
          .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.walletFingerprint, walletFingerprint)));
        return rows.map((row) => projectRole(row.role));
      },
      async saveAgreement(record) {
        await db.insert(agreementVersions).values(record);
      },
      async getAgreement(projectId, version) {
        const rows = await db
          .select()
          .from(agreementVersions)
          .where(and(eq(agreementVersions.projectId, projectId), eq(agreementVersions.version, version)))
          .limit(1);
        return rows[0] ? toAgreementRecord(rows[0]) : undefined;
      },
      async listAgreements(projectId) {
        const rows = await db
          .select()
          .from(agreementVersions)
          .where(eq(agreementVersions.projectId, projectId))
          .orderBy(asc(agreementVersions.version));
        return rows.map(toAgreementRecord);
      },
      async saveCheckpoint(record) {
        await db.insert(checkpoints).values({
          ...record,
          assignedReviewerFingerprint: record.assignedReviewerFingerprint ?? null,
        });
      },
      async getCheckpoint(id) {
        const rows = await db.select().from(checkpoints).where(eq(checkpoints.id, id)).limit(1);
        return rows[0] ? toCheckpointRecord(rows[0]) : undefined;
      },
      async listCheckpoints(projectId) {
        const rows = await db
          .select()
          .from(checkpoints)
          .where(eq(checkpoints.projectId, projectId))
          .orderBy(asc(checkpoints.sequence));
        return rows.map(toCheckpointRecord);
      },
      async saveAuditEvent(record) {
        await db.insert(auditEvents).values(record);
      },
    },
  };
}

export function createMemoryRepositories(): {
  nonces: AuthNonceRepository;
  sessions: SessionRepository;
  projects: ProjectRepository;
} {
  const nonceRows = new Map<string, AuthNonceRecord>();
  const sessionRows = new Map<string, SessionRecord & { revokedAt?: Date }>();
  const projectRows = new Map<string, ProjectKeyRecord>();
  const memberRows = new Map<string, ProjectMemberRecord>();
  const agreementRows = new Map<string, AgreementVersionRecord>();
  const checkpointRows = new Map<string, CheckpointRecord>();
  const auditRows: AuditEventRecord[] = [];
  return {
    nonces: {
      async saveNonce(record) {
        if (nonceRows.has(record.nonce)) throw new Error("NONCE_ALREADY_EXISTS");
        nonceRows.set(record.nonce, structuredClone(record));
      },
      async getNonce(nonce) {
        const record = nonceRows.get(nonce);
        return record ? structuredClone(record) : undefined;
      },
      async consumeNonce(nonce, now) {
        const record = nonceRows.get(nonce);
        if (!record || record.expiresAt <= now) return undefined;
        if (record.consumedAt) return "REPLAYED";
        const consumed = { ...record, consumedAt: now };
        nonceRows.set(nonce, consumed);
        return structuredClone(consumed);
      },
    },
    sessions: {
      async saveSession(record) {
        if (sessionRows.has(record.id)) throw new Error("SESSION_ALREADY_EXISTS");
        sessionRows.set(record.id, structuredClone(record));
      },
      async revokeSession(id, now) {
        const record = sessionRows.get(id);
        if (record && !record.revokedAt) record.revokedAt = now;
      },
    },
    projects: {
      async saveProject(record) {
        if (projectRows.has(record.id)) throw new Error("PROJECT_ALREADY_EXISTS");
        projectRows.set(record.id, structuredClone(record));
      },
      async getProject(id) {
        const record = projectRows.get(id);
        return record ? structuredClone(record) : undefined;
      },
      async saveMember(record) {
        const key = `${record.projectId}:${record.walletFingerprint}:${record.role}`;
        if (memberRows.has(key)) throw new Error("PROJECT_MEMBER_ALREADY_EXISTS");
        memberRows.set(key, structuredClone(record));
      },
      async getMemberRoles(projectId, walletFingerprint) {
        return [...memberRows.values()]
          .filter((record) => record.projectId === projectId && record.walletFingerprint === walletFingerprint)
          .map((record) => record.role);
      },
      async saveAgreement(record) {
        const key = `${record.projectId}:${record.version}`;
        if (agreementRows.has(key)) throw new Error("AGREEMENT_VERSION_ALREADY_EXISTS");
        agreementRows.set(key, structuredClone(record));
      },
      async getAgreement(projectId, version) {
        const record = agreementRows.get(`${projectId}:${version}`);
        return record ? structuredClone(record) : undefined;
      },
      async listAgreements(projectId) {
        return [...agreementRows.values()]
          .filter((record) => record.projectId === projectId)
          .sort((left, right) => left.version - right.version)
          .map((record) => structuredClone(record));
      },
      async saveCheckpoint(record) {
        if (checkpointRows.has(record.id)) throw new Error("CHECKPOINT_ALREADY_EXISTS");
        if ([...checkpointRows.values()].some((row) => row.projectId === record.projectId && row.sequence === record.sequence)) {
          throw new Error("CHECKPOINT_SEQUENCE_ALREADY_EXISTS");
        }
        checkpointRows.set(record.id, structuredClone(record));
      },
      async getCheckpoint(id) {
        const record = checkpointRows.get(id);
        return record ? structuredClone(record) : undefined;
      },
      async listCheckpoints(projectId) {
        return [...checkpointRows.values()]
          .filter((record) => record.projectId === projectId)
          .sort((left, right) => left.sequence - right.sequence)
          .map((record) => structuredClone(record));
      },
      async saveAuditEvent(record) {
        if (auditRows.some((row) => row.id === record.id)) throw new Error("AUDIT_EVENT_ALREADY_EXISTS");
        auditRows.push(structuredClone(record));
      },
    },
  };
}

export async function pingDatabase(db: VeilapDatabase): Promise<void> {
  await db.execute(sql`select 1`);
}

export type SensitiveRecord = EncryptedField;
